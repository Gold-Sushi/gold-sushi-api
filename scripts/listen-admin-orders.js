/* eslint-disable */
/**
 * Connects to the admin live-notifications socket and prints every order
 * event it receives — a quick way to watch `order:new` / `order:paid` while
 * placing orders through Swagger or the frontend.
 *
 *   # 1. Log in as an ADMIN (POST /api/auth/login) and copy the access token
 *   # 2. Run:
 *   npm run orders:listen -- <access-token>
 *
 * Optional env:
 *   API_ORIGIN   where the API runs (default http://localhost:${PORT || 4200})
 *
 * A non-admin or invalid token is refused with `connect_error` (Forbidden /
 * Unauthorized); an expired token gets `error` and a disconnect.
 */

const { io } = require('socket.io-client');

const token = process.argv[2] || process.env.ADMIN_TOKEN;
if (!token) {
  console.error('Usage: npm run orders:listen -- <admin-access-token>');
  process.exit(1);
}

const origin = process.env.API_ORIGIN || `http://localhost:${process.env.PORT || 4200}`;

const socket = io(`${origin}/admin`, {
  path: '/api/socket.io',
  transports: ['websocket'],
  auth: { token },
  reconnection: false,
});

socket.on('connect', () => console.log(`✓ connected to ${origin}/admin (${socket.id}), waiting for orders…`));
socket.on('order:new', (order) => console.log('\n🆕 order:new', JSON.stringify(order, null, 2)));
socket.on('order:paid', (order) => console.log('\n💳 order:paid', JSON.stringify(order, null, 2)));
socket.on('error', (err) => console.error('✗ error:', err));
socket.on('connect_error', (err) => {
  console.error('✗ connect_error:', err.message);
  process.exit(1);
});
socket.on('disconnect', (reason) => {
  console.log(`disconnected: ${reason}`);
  process.exit(0);
});
