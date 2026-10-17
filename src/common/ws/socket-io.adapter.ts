import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { resolveCorsOrigins } from '@common/site.constants';

/**
 * Socket.IO adapter that applies the same CORS allow-list as the HTTP API.
 * Done here (at runtime) rather than in `@WebSocketGateway` options because
 * env vars are not guaranteed to be loaded when decorators are evaluated.
 */
export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: resolveCorsOrigins((key) => process.env[key]),
        credentials: true,
      },
    });
  }
}
