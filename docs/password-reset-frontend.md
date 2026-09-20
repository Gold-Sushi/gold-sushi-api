# Password reset & change password — frontend integration guide

A step-by-step walkthrough of which endpoint to call, in what order, and why.
The API is live; nothing here needs a backend change.

- **Base URL:** `${API_URL}/api` — locally `http://localhost:4200/api`
- **Swagger:** `${API_URL}/swagger`, tag **auth** — the authoritative contract
- **Auth header:** needed on `change-password` only

There are two independent flows. **Flow A** is for a user locked out of their
account (3 steps, 2 screens). **Flow B** is for a logged-in user changing their
password (1 step). They share nothing but the password rules in §4.

---

## Flow A — user forgot their password

```
 Screen 1: /forgot-password          Screen 2: /reset-password?token=…
 ┌──────────────────────┐            ┌──────────────────────────────┐
 │ A1 forgot-password   │  ──email─► │ A2 reset-password            │ on submit
 │    (enter email)     │            │    (validates + sets)        │
 └──────────────────────┘            └──────────────────────────────┘
                                                    │
                                                    ▼
                                            A3 login  → /login
```

Three calls, in this order. **There is no endpoint to pre-check the token** —
`reset-password` validates it and sets the password in one shot. Screen 2 must
therefore render its form immediately, without calling the API on mount.

---

### Step A1 — request the link

**When:** user submits the email field on `/forgot-password`.

```http
POST /api/auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

**Success — `201`:**

```json
{ "message": "Якщо для цієї адреси існує обліковий запис, ми надіслали лист із посиланням для відновлення паролю." }
```

**Failures:**

| Status | Cause | What to show |
|---|---|---|
| `400` | Not a valid email format | Field-level validation error |
| `429` | 4th request within a minute | "Забагато спроб. Спробуйте за хвилину." |

**What to do next:** switch the screen to a "перевірте пошту" state. Render the
returned `message` as-is — it is already user-facing Ukrainian. Tell the user
the link is valid for **30 minutes**. Then stop; the flow continues in their
inbox.

**Why the response is worded so vaguely:** it is byte-identical whether or not
that email belongs to an account. If it said "no such user", anyone could feed
it a list of addresses and learn who is registered. Two consequences you must
respect:

- **Never render "email not found" on this screen.** You have no way to know,
  and inventing one would reintroduce the leak the API is closing.
- Guest accounts — people who ordered without registering — also get this
  response and no email, because they have no password to reset. Your
  confirmation copy should mention registering as a fallback.

**Why the limit is only 3/min:** every call sends a real email. Disable the
submit button while the request is in flight — with a 3-call budget, one
accidental double-click costs the user two thirds of it.

---

### Step A2 — validate the token and set the new password

This single call does both jobs. Read the token from the URL on mount, but do
not send anything yet.

```ts
const [params] = useSearchParams();
const token = params.get('token');
```

Do not trim, lowercase or otherwise normalise it — it is a case-sensitive
64-character hex string and any edit breaks it. **If `token` is absent, render
the dead-link state immediately** and never enable the form; there is nothing
to submit.

**When:** user submits the new-password form.

```http
POST /api/auth/reset-password
Content-Type: application/json

{ "token": "3f1a9c…", "password": "NewPassw0rd" }
```

**Success — `201`:**

```json
{ "message": "Пароль успішно змінено" }
```

**Failures — two different `400`s, and you must tell them apart:**

| Status | `message` shape | Meaning | What to show |
|---|---|---|---|
| `400` | **string** | Token unknown, expired, or already used | Swap the form for the dead-link state |
| `400` | **array** | New password outside 8–72 chars | Field-level error on the password input |
| `429` | string | 6th request within a minute | "Забагато спроб. Спробуйте за хвилину." |

```ts
const isDeadLink = (e) =>
  e.response?.status === 400 && typeof e.response.data?.message === 'string';
```

**⚠️ The array case does not mean the token is good.** Payload validation runs
*before* the controller, so when both the password and the token are bad, you
get the array error and hear nothing about the token. Never infer "token is
still valid" from a validation error — the only positive signal is a `201`.
This is also why you should enforce the 8–72 rule client-side: it keeps the
ambiguous case from ever reaching the user.

**What to do next on success:** show a success toast and **redirect to
`/login`**. This endpoint returns no `access_token`, so the user is not logged
in. Proceed to step A3.

**What to do next on a string-shaped `400`:** replace the form with
"Посилання недійсне або застаріле" plus a link back to `/forgot-password`. Do
not leave the form up for a retry — the token is single-use and is destroyed
the moment a reset succeeds, so resubmitting can never work.

**Why there is no separate pre-check call:** a `POST /auth/reset-password/validate`
endpoint used to exist and was removed. Do not call it; it now returns `404`.
The trade-off is deliberate — one fewer round trip, at the cost of the user
discovering a dead link only after typing a password. Soften that in your copy
by stating the 30-minute expiry up front on both screens.

---

### Step A3 — log in with the new password

Nothing special, the standard call:

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "NewPassw0rd" }
```

**Success — `201`:**

```json
{ "id": "78b9a786-…", "email": "user@example.com", "role": "USER", "access_token": "eyJhbGciOi…" }
```

`401` means wrong credentials. Store `access_token` exactly as you do after a
normal login.

**Optional:** you may prefill the email field from a query param or state you
carried through, but the old password is dead — never attempt a silent login
with it.

---

## Flow B — logged-in user changes their password

One call. No token, no email.

**When:** user submits the password form in the profile area.

```http
POST /api/auth/change-password
Authorization: Bearer <access_token>
Content-Type: application/json

{ "currentPassword": "OldPassw0rd", "newPassword": "NewPassw0rd" }
```

**Success — `201`:**

```json
{ "message": "Пароль успішно змінено" }
```

**Failures:**

| Status | Cause | What to show |
|---|---|---|
| `401` | Missing/expired JWT **or** wrong `currentPassword` | `"Невірний поточний пароль"` on the current-password field |
| `400` (string) | New password equals the current one | The message |
| `400` (array) | New password outside 8–72 chars | Field-level error |
| `429` | 6th request within a minute | "Забагато спроб. Спробуйте за хвилину." |

**What to do next:** show the success message. The user's session stays valid —
do not log them out or refresh the token.

**Why `currentPassword` is required at all:** it means a stolen `access_token`
alone cannot be used to take over the account. Do not add a "skip if already
logged in" path.

**⚠️ The one thing that will break here:** a wrong current password returns
`401`, the same status as an expired session. If you have a global axios
interceptor that logs the user out on any `401`, a simple typo will eject them
from the app mid-form. **Exempt this endpoint from that interceptor**, or
branch on the response message before redirecting.

---

## 3. Cross-cutting rules

### Successful POSTs return `201`, not `200`

NestJS defaults every `POST` to `201 Created` — this applies to all four calls
above, login included. Never write `if (res.status === 200)`. Use `res.ok`, or
let axios throw on non-2xx.

### `message` is a string on business errors, an array on validation errors

```jsonc
// 400 — payload validation failed
{ "message": ["password must be longer than or equal to 8 characters"], "error": "Bad Request", "statusCode": 400 }

// 400 — business rule
{ "message": "Посилання для відновлення паролю недійсне або застаріле", "error": "Bad Request", "statusCode": 400 }
```

This shape difference is load-bearing in step A2 — it is the only way to tell a
dead link from a bad password. Normalise for display, but branch on the raw
shape:

```ts
export const apiMessage = (data: unknown, fallback = 'Сталася помилка. Спробуйте ще раз.') => {
  const m = (data as { message?: string | string[] })?.message;
  if (Array.isArray(m)) return m[0] ?? fallback;
  return typeof m === 'string' ? m : fallback;
};
```

### Business messages are already Ukrainian; validation messages are not

Strings like `"Пароль успішно змінено"` are finished user-facing copy — render
them directly. The array-shaped validation messages are English and meant for
developers; show your own copy for those. Your client-side rules should catch
them before they ever reach the user.

### Rate limits, per IP

| Endpoint | Limit |
|---|---|
| `forgot-password` | 3 / min |
| `reset-password` | 5 / min |
| `change-password` | 5 / min |

`429` is a normal outcome, not a bug. Handle it on all three.

---

## 4. Password rules

Mirror these client-side — in step A2 this is not just polish, it is what keeps
the ambiguous "array error hides a dead token" case off the user's screen:

- **Minimum 8 characters**
- **Maximum 72 characters** — a hard bcrypt limit, not an arbitrary choice
- **No complexity requirement.** Do not invent one — the API will not enforce
  it, and your form would reject passwords the API happily accepts

Add a "повторіть пароль" confirm field in your form only; the API takes a
single `password` and does not check confirmation.

---

## 5. Link and token behaviour

Facts that drive your copy:

- **The link expires 30 minutes after A1.** State this on both screens — with
  no pre-check call, it is the user's only warning before a failed submit.
- **The link is single-use.** It stops working the instant A2 succeeds.
- **Requesting a new link kills the previous one.** If you add a "надіслати ще
  раз" button, warn that older links stop working — otherwise users click the
  first email and get a confusing "недійсне".
- **The `/reset-password` path is fixed by the backend.** It builds the link by
  appending `/reset-password?token=<token>` to the configured frontend origin
  (`FRONTEND_URL`, falling back to `https://www.goldsushi.store`). If you need a
  different path, that is the `PASSWORD_RESET_URL` env var — a config change,
  not a code change. Just ask.
- **Mail is sent via Resend from `noreply@<SITE_DOMAIN>`.**

---

## 6. Testing without waiting for an email

**To build the dead-link state:** submit the form at
`/reset-password?token=obviously-fake` with a *valid* password (8+ chars). You
get the string-shaped `400` and the real code path. Use a valid password
deliberately — a short one returns the array error instead and you will be
testing the wrong branch.

**To build the happy path:** ask backend to issue a link for a test account.
They cannot retrieve an *existing* token — only a hash of it is stored, by
design — so they will generate a fresh one, which invalidates any earlier link.

**On a local API without `RESEND_API_KEY`:** A1 still returns `201` and no mail
is sent. That is expected and not a sign your request was malformed.

---

## 7. Pre-merge checklist

- [ ] `/reset-password` route exists and reads `?token=`
- [ ] Screen 2 renders the form on mount — **no** validation call
- [ ] Missing `?token=` short-circuits to the dead-link state
- [ ] A2 branches on `typeof message === 'string'` to detect a dead link
- [ ] A2 never treats an array-shaped `400` as proof the token is valid
- [ ] String-shaped `400` replaces the form; no retry left available
- [ ] Nothing calls `/auth/reset-password/validate` (removed, returns `404`)
- [ ] No "email not found" copy anywhere on `/forgot-password`
- [ ] After A2 → redirect to `/login` (no token is returned)
- [ ] Global `401` interceptor exempts `change-password`
- [ ] All four calls treat `201` as success
- [ ] `429` handled on all three rate-limited calls
- [ ] Submit buttons disabled while in flight
- [ ] Client-side rule is min 8 / max 72, nothing stricter
- [ ] "Link valid for 30 minutes" appears on both Flow A screens
- [ ] Your origin is in the CORS allow-list (`localhost:3000` and `FRONTEND_URL`
      are; anything else needs a backend env change)

---

## Open questions for backend

- **Sessions survive a password reset.** A device already logged in stays
  logged in after A2. If you want "log out everywhere", that is a backend
  change — raise it.
- **Auto-login after A2** instead of redirecting to `/login` is a one-line
  change. Ask if you want it and skip step A3.
- **A machine-readable error code** for the dead-link case (instead of relying
  on the string-vs-array shape) is easy to add if the current discriminator
  feels too implicit. Say the word.
