# Password reset & change password — frontend integration guide

A step-by-step walkthrough of which endpoint to call, in what order, and why.
The API is live; nothing here needs a backend change.

- **Base URL:** `${API_URL}/api` — locally `http://localhost:4200/api`
- **Swagger:** `${API_URL}/swagger`, tag **auth** — the authoritative contract
- **Auth header:** needed on `change-password` only

There are two independent flows. **Flow A** is for a user locked out of their
account (4 steps, 2 screens). **Flow B** is for a logged-in user changing their
password (1 step). They share nothing but the password rules in §4.

---

## Flow A — user forgot their password

```
 Screen 1: /forgot-password          Screen 2: /reset-password?token=…
 ┌──────────────────────┐            ┌──────────────────────────────┐
 │ A1 forgot-password   │  ──email─► │ A2 reset-password/validate   │ on mount
 │    (enter email)     │            │ A3 reset-password            │ on submit
 └──────────────────────┘            └──────────────────────────────┘
                                                    │
                                                    ▼
                                            A4 login  → /login
```

Call them in exactly this order. A2 and A3 both need the `token` from the URL.

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

### Step A2 — validate the token on page load

**When:** immediately on mount of `/reset-password`, before rendering the form.

Read the token first:

```ts
const [params] = useSearchParams();
const token = params.get('token');
```

Do not trim, lowercase or otherwise normalise it. It is a case-sensitive
64-character hex string; any edit breaks it. **If `token` is absent, skip the
call entirely** and go straight to the invalid state — there is nothing to
validate.

```http
POST /api/auth/reset-password/validate
Content-Type: application/json

{ "token": "3f1a9c…" }
```

**Success — `201` either way:**

```json
{ "valid": true }
```

An unusable token is `{ "valid": false }` with status `201`, **not** an error
status. Branch on the body, not the status code.

**Failures:**

| Status | Cause | What to show |
|---|---|---|
| `400` | `token` missing/empty in your payload | Invalid state (you sent a bad request) |
| `429` | 11th request within a minute | Invalid state — **do not retry** |

**What to do next:** `true` → render the new-password form. `false` → render
"Посилання недійсне або застаріле" with a link back to `/forgot-password`.

**Why this step exists:** purely so the user finds out the link is dead
*before* typing a new password twice. It is a UX affordance, not a security
gate — step A3 re-checks the token itself and will reject it regardless. So
never treat a `true` here as permission to skip error handling in A3.

**Why you must not retry on failure:** the 10/min cap is per IP. A retry loop
on a flaky network would burn through it and lock the user out of their own
valid link. One attempt, then fall back to the invalid state.

---

### Step A3 — set the new password

**When:** user submits the form rendered in A2.

```http
POST /api/auth/reset-password
Content-Type: application/json

{ "token": "3f1a9c…", "password": "NewPassw0rd" }
```

Send the same `token` from the URL — not anything returned by A2, which
returns no token.

**Success — `201`:**

```json
{ "message": "Пароль успішно змінено" }
```

**Failures:**

| Status | `message` shape | Cause | What to show |
|---|---|---|---|
| `400` | string | Token invalid, expired, or already used | The message, then switch to the invalid state |
| `400` | array | Password outside 8–72 chars | Field-level error (your own copy) |
| `429` | string | 6th request within a minute | "Забагато спроб. Спробуйте за хвилину." |

**What to do next:** show a success toast and **redirect to `/login`**.

**Why you must redirect rather than enter the app:** this endpoint returns no
`access_token`. The user is not logged in. Proceed to step A4.

**Why a `400` should flip you back to the invalid state:** the token is
single-use and is destroyed the moment a reset succeeds. A string-shaped `400`
here means it is gone for good, so re-submitting the same form can never
work — send the user back to `/forgot-password` instead of letting them retry.

---

### Step A4 — log in with the new password

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

One call. No token, no email, no preliminary validation step.

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

NestJS defaults every `POST` to `201 Created` — this applies to all five calls
above, login included. Never write `if (res.status === 200)`. Use `res.ok`, or
let axios throw on non-2xx.

### `message` is a string on business errors, an array on validation errors

```jsonc
// 400 — DTO validation failed
{ "message": ["password must be longer than or equal to 8 characters"], "error": "Bad Request", "statusCode": 400 }

// 400 — business rule
{ "message": "Посилання для відновлення паролю недійсне або застаріле", "error": "Bad Request", "statusCode": 400 }
```

The tables above tell you which shape to expect where. Normalise once:

```ts
export const apiMessage = (data: unknown, fallback = 'Сталася помилка. Спробуйте ще раз.') => {
  const m = (data as { message?: string | string[] })?.message;
  if (Array.isArray(m)) return m[0] ?? fallback;
  return typeof m === 'string' ? m : fallback;
};
```

### Business messages are already Ukrainian; validation messages are not

Strings like `"Пароль успішно змінено"` are finished user-facing copy — render
them directly. The array-shaped validation messages are English and are meant
for developers; show your own copy for those. Your client-side rules should
catch them before they ever reach the user.

### Rate limits, per IP

| Endpoint | Limit | A `429` means |
|---|---|---|
| `forgot-password` | 3 / min | User spammed the button |
| `reset-password/validate` | 10 / min | Usually your own retry loop |
| `reset-password` | 5 / min | User spammed the button |
| `change-password` | 5 / min | User spammed the button |

`429` is a normal outcome, not a bug. Handle it on all four.

---

## 4. Password rules

Mirror these client-side so the user gets instant feedback:

- **Minimum 8 characters**
- **Maximum 72 characters** — a hard bcrypt limit, not an arbitrary choice
- **No complexity requirement.** Do not invent one — the API will not enforce
  it, and your form would reject passwords the API happily accepts

Add a "повторіть пароль" confirm field in your form only; the API takes a
single `password` and does not check confirmation.

---

## 5. Link and token behaviour

Facts that drive your copy:

- **The link expires 30 minutes after A1.** Say so on the "check your mail"
  screen; it saves support calls.
- **The link is single-use.** It stops working the instant A3 succeeds.
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

**To build the invalid/expired state:** just visit
`/reset-password?token=obviously-fake`. A2 returns `{ "valid": false }` and you
get the real code path, no email needed.

**To build the happy path:** ask backend to issue a link for a test account.
Note they cannot retrieve an *existing* token — only a hash of it is stored, by
design — so they will generate a fresh one, which invalidates any earlier link.

**On a local API without `RESEND_API_KEY`:** A1 still returns `201` and no mail
is sent. That is expected and not a sign your request was malformed.

---

## 7. Pre-merge checklist

- [ ] `/reset-password` route exists and reads `?token=`
- [ ] A2 runs on mount; missing token short-circuits without an API call
- [ ] A2 branches on `body.valid`, not on status code
- [ ] No retry loop on A2
- [ ] No "email not found" copy anywhere on `/forgot-password`
- [ ] A3 sends the token from the URL, and a string-shaped `400` flips to the invalid state
- [ ] After A3 → redirect to `/login` (no token is returned)
- [ ] Global `401` interceptor exempts `change-password`
- [ ] All five calls treat `201` as success
- [ ] `429` handled on all four rate-limited calls
- [ ] Submit buttons disabled while in flight
- [ ] Client-side rule is min 8 / max 72, nothing stricter
- [ ] "Link valid for 30 minutes" appears in the check-your-mail copy
- [ ] Your origin is in the CORS allow-list (`localhost:3000` and `FRONTEND_URL`
      are; anything else needs a backend env change)

---

## Open questions for backend

- **Sessions survive a password reset.** A device already logged in stays
  logged in after A3. If you want "log out everywhere", that is a backend
  change — raise it.
- **Auto-login after A3** instead of redirecting to `/login` is a one-line
  change. Ask if you want it and skip step A4.
