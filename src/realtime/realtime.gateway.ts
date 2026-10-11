import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Socket.IO on the same port as the HTTP API. Clients authenticate with their access token in the
 * handshake (`auth: { token }`), never with cookies, so any origin may connect; an invalid token is rejected.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Registers the handshake check and hands the server to `RealtimeService`. */
  afterInit(server: Server): void {
    this.realtime.server = server;
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      void this.tokens.verifyAccess(token).then((userId) => {
        if (!userId) return next(new Error('unauthorized'));
        socket.data['userId'] = userId;
        next();
      });
    });
  }

  /** Puts the socket in the user's room and in the room of every project they belong to. */
  async handleConnection(client: Socket): Promise<void> {
    const userId = client.data['userId'] as string | undefined;
    if (!userId) return;
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    await client.join([
      `user:${userId}`,
      ...memberships.map((m) => `project:${m.projectId}`),
    ]);
    this.logger.debug(`Socket connected for ${userId}`);
  }
}
