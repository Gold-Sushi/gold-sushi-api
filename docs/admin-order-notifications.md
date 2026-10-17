# Admin live order notifications — frontend integration guide

The admin panel can receive new orders in real time over a WebSocket
(Socket.IO) instead of polling `GET /api/orders/all`. Only users with the **ADMIN**
role can connect.

- **Client library:** [`socket.io-client`](https://www.npmjs.com/package/socket.io-client) v4
- **URL:** `${API_URL}/admin` (namespace `/admin`) — locally `http://localhost:4200/admin`
- **Path:** `/api/socket.io` (must be set explicitly, see below)
- **Auth:** the same JWT access token used for the REST API, passed in `auth.token`
- **Direction:** server → client only; the client never emits anything

---

## 1. Connect

```ts
import { io } from 'socket.io-client';

const socket = io(`${API_URL}/admin`, {
  path: '/api/socket.io',     // NOT the default /socket.io
  transports: ['websocket'],  // skip long-polling (it would hit the nginx API rate limit)
  auth: { token: accessToken },
});
```

Connect only after an admin has logged in, and `socket.disconnect()` on logout.

## 2. Events

| Event        | When                                                                 |
|--------------|----------------------------------------------------------------------|
| `order:new`  | Any order is created (cash, card or online — even before it's paid). |
| `order:paid` | Monobank confirmed an online payment for an order.                   |

Both carry the same payload:

```ts
interface AdminOrderNotification {
  id: string;
  number: string;
  status: number;            // OrderStatus: 0 New, 1 Processing, 2 Cooking, …
  total: number;             // UAH
  paymentType: number;       // 0 Cash, 1 Card, 2 Online
  paymentStatus: string;     // 'none' | 'created' | 'success' | …
  deliveryType: number;      // 0 SelfPickup, 1 Courier
  deliveryScheduleTime: string | null;
  createdAt: string;
  itemsCount: number;        // total quantity of all lines
  customer: { firstName: string | null; lastName: string | null; phone: string | null };
}

socket.on('order:new', (order: AdminOrderNotification) => { /* toast + prepend to list */ });
socket.on('order:paid', (order: AdminOrderNotification) => { /* update the row by id */ });
```

The payload is a summary. Fetch `GET /api/orders/:id` when the admin opens the
order to get its lines and address.

An online order normally arrives twice: first `order:new` (`paymentStatus:
'created'`), then `order:paid` (`paymentStatus: 'success'`, `status: 1`
Processing). If `order:paid` arrives with `status: 0` (New), the paid amount did
not match the order total and someone needs to check it by hand.

## 3. Errors & reconnection

```ts
// Refused at connect time: no token / invalid token → 'Unauthorized',
// valid token without ADMIN role → 'Forbidden'.
socket.on('connect_error', (err) => {
  if (err.message === 'Unauthorized') {
    // refresh the access token, then:
    socket.auth = { token: newAccessToken };
    socket.connect();
  }
});

// The server closes the socket when the access token expires.
socket.on('error', (e: { message: string }) => { /* 'Token expired' → refresh & reconnect as above */ });
```

On network drops Socket.IO reconnects on its own. Events sent while the client
was offline are **not** replayed, so refetch the order list after a reconnect:

```ts
socket.io.on('reconnect', () => refetchOrders());
```

## 4. Trying it locally

```bash
npm run start:dev
# log in as an admin via Swagger (POST /api/auth/login), copy the access token
npm run orders:listen -- <access-token>
# place an order via Swagger (POST /api/orders) → the listener prints order:new
```
