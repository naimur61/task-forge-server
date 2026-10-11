import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../core/env.validation.js';
import { newId } from '../common/utils/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessTokenPayload } from './auth.types.js';

/** Returns the SHA-256 hex digest used to store refresh and reset tokens. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Issues and verifies access tokens (JWT) and opaque refresh tokens (hashed in the database). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Signs a short-lived access token for the user. */
  signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId } satisfies AccessTokenPayload);
  }

  /** Returns the user id of a valid access token, or `null` if it is forged or expired. */
  async verifyAccess(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      return payload.sub;
    } catch {
      return null;
    }
  }

  /** Stores a new refresh token and returns its raw value for the cookie. */
  async issueRefresh(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        id: newId('rft'),
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return raw;
  }

  /**
   * Rotates a refresh token: revokes the presented one and issues a new pair.
   * Presenting an already-revoked token is treated as theft and revokes every session of that user.
   * Returns `null` when the token is unknown, revoked or expired.
   */
  async rotate(
    raw: string,
  ): Promise<{ userId: string; refreshToken: string } | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
    if (!token) return null;
    if (token.revokedAt) {
      await this.revokeAll(token.userId);
      return null;
    }
    if (token.expiresAt < new Date()) return null;

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });
    return {
      userId: token.userId,
      refreshToken: await this.issueRefresh(token.userId),
    };
  }

  /** Revokes one refresh token (logout). */
  async revoke(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active refresh token of a user. */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
