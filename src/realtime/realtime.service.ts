import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';

/** Payload of every server → client event (BACKEND_API.md section 6). */
export interface RealtimePayload {
  projectId?: string;
  taskId?: string;
  /** User the change is about (added/removed member, assignee). */
  userId?: string;
  actorId: string;
  actorName: string;
  /** Short text for a toast. */
  message?: string;
}

type Extra = Omit<RealtimePayload, 'actorId' | 'actorName'>;

/** Pushes events to the Socket.IO rooms `user:<id>` and `project:<id>`; a no-op until the gateway is up. */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  /** Set by the gateway once Socket.IO is initialised. */
  server?: Server;

  constructor(private readonly prisma: PrismaService) {}

  /** Emits an event to everyone in a project room. */
  toProject(
    event: string,
    projectId: string,
    actorId: string,
    extra: Extra = {},
  ): void {
    this.emit(`project:${projectId}`, event, actorId, { projectId, ...extra });
  }

  /** Emits an event to one user's room. */
  toUser(
    event: string,
    userId: string,
    actorId: string,
    extra: Extra = {},
  ): void {
    this.emit(`user:${userId}`, event, actorId, { userId, ...extra });
  }

  /** Joins all of a user's sockets to a project room. */
  joinProject(userId: string, projectId: string): void {
    this.server?.in(`user:${userId}`).socketsJoin(`project:${projectId}`);
  }

  /** Removes all of a user's sockets from a project room. */
  leaveProject(userId: string, projectId: string): void {
    this.server?.in(`user:${userId}`).socketsLeave(`project:${projectId}`);
  }

  /** Empties a project room (the project was deleted). */
  closeProjectRoom(projectId: string): void {
    this.server
      ?.in(`project:${projectId}`)
      .socketsLeave(`project:${projectId}`);
  }

  /** Fire-and-forget: realtime must never fail the request that caused it. */
  private emit(
    room: string,
    event: string,
    actorId: string,
    extra: Extra,
  ): void {
    const server = this.server;
    if (!server) return;
    void this.prisma.user
      .findUnique({ where: { id: actorId }, select: { name: true } })
      .then((actor) => {
        server.to(room).emit(event, {
          ...extra,
          actorId,
          actorName: actor?.name ?? 'Someone',
        } satisfies RealtimePayload);
      })
      .catch((err: unknown) =>
        this.logger.warn(`emit ${event} failed: ${String(err)}`),
      );
  }
}
