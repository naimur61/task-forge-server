import { randomBytes } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '../common/dto/api-response.dto.js';
import { ApiException } from '../common/exceptions/api.exception.js';
import { newId } from '../common/utils/ids.js';
import type { Env } from '../core/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto/auth-request.dto.js';
import type { AuthUserResponse } from './dto/auth-response.dto.js';
import { PasswordService } from './password.service.js';
import { hashToken, TokenService } from './token.service.js';

/** Email domain given to anonymised accounts; user search hides it. */
export const DELETED_EMAIL_DOMAIN = '@deleted.invalid';

/** A fresh session: the user plus both tokens. */
export interface SessionResult {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
}

/** Maps a user row to the `AuthUser` of the API (`avatarUrl` is called `avatar` here). */
function toAuthUser(user: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}): AuthUserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

/** Registration, login, token refresh, profile and password handling. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Creates an account and signs it in; 409 `EMAIL_TAKEN` if the email exists. */
  async register(dto: RegisterDto): Promise<SessionResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw this.emailTaken();
    const user = await this.prisma.user.create({
      data: {
        id: newId('usr'),
        name: dto.name,
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
      },
    });
    return this.startSession(user);
  }

  /** Checks credentials; the same 401 for an unknown email and a wrong password. */
  async login(dto: LoginDto): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const valid =
      user && (await this.passwords.verify(user.passwordHash, dto.password));
    if (!user || !valid) {
      throw new ApiException(
        401,
        'INVALID_CREDENTIALS',
        'Incorrect email or password.',
      );
    }
    return this.startSession(user);
  }

  /** Rotates the refresh cookie and returns a new access token; 401 `REFRESH_INVALID` otherwise. */
  async refresh(
    rawRefresh: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rotated = rawRefresh ? await this.tokens.rotate(rawRefresh) : null;
    if (!rotated) {
      throw new ApiException(401, 'REFRESH_INVALID', 'Session expired.');
    }
    return {
      accessToken: await this.tokens.signAccess(rotated.userId),
      refreshToken: rotated.refreshToken,
    };
  }

  /** Revokes the presented refresh token, if any. */
  async logout(rawRefresh: string | undefined): Promise<void> {
    if (rawRefresh) await this.tokens.revoke(rawRefresh);
  }

  /** Returns the signed-in user. */
  async me(userId: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Authentication required.');
    return toAuthUser(user);
  }

  /** Updates name, email or avatar. */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AuthUserResponse> {
    if (dto.email) {
      const other = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (other && other.id !== userId) throw this.emailTaken();
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.avatar !== undefined && { avatarUrl: dto.avatar || null }),
      },
    });
    return toAuthUser(user);
  }

  /** Changes the password after checking the current one. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Authentication required.');
    if (
      !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
    ) {
      throw this.fieldError(
        'currentPassword',
        'Current password is incorrect.',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });
  }

  /** Creates a reset token; never reveals whether the email exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const raw = randomBytes(32).toString('base64url');
    const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', {
      infer: true,
    });
    await this.prisma.passwordReset.create({
      data: {
        id: newId('pwr'),
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });
    // No mail provider is configured: the link is written to the server log instead.
    const [origin] = this.config.get('FRONTEND_ORIGINS', { infer: true });
    this.logger.log(
      `Password reset link for ${email}: ${origin}/reset-password?token=${raw}`,
    );
  }

  /** Sets a new password from a reset token and signs the user out everywhere. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw this.fieldError('token', 'Reset link is invalid or has expired.');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Anonymises the account (tasks and comments keep a valid author reference).
   * Refused while the user owns a project that has other members.
   */
  async deleteAccount(userId: string): Promise<void> {
    const shared = await this.prisma.project.count({
      where: {
        ownerId: userId,
        members: { some: { userId: { not: userId } } },
      },
    });
    if (shared > 0) {
      throw new ApiException(
        422,
        'OWNER_CANNOT_LEAVE',
        'Transfer ownership of your shared projects before deleting your account.',
      );
    }
    const passwordHash = await this.passwords.hash(
      randomBytes(24).toString('hex'),
    );
    await this.prisma.$transaction([
      this.prisma.project.deleteMany({ where: { ownerId: userId } }),
      this.prisma.projectMember.deleteMany({ where: { userId } }),
      this.prisma.task.updateMany({
        where: { assigneeId: userId },
        data: { assigneeId: null },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Deleted user',
          email: `deleted+${userId}${DELETED_EMAIL_DOMAIN}`,
          avatarUrl: null,
          passwordHash,
        },
      }),
    ]);
  }

  /** Builds a session (access + refresh token) for a user row. */
  private async startSession(user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }): Promise<SessionResult> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess(user.id),
      this.tokens.issueRefresh(user.id),
    ]);
    return { user: toAuthUser(user), accessToken, refreshToken };
  }

  /** The 409 returned when an email is already registered. */
  private emailTaken(): ApiException {
    return new ApiException(
      409,
      'EMAIL_TAKEN',
      'An account with this email already exists.',
      { email: 'Already in use.' },
    );
  }

  /** A 400 pinned to one form field. */
  private fieldError(field: string, message: string): ApiException {
    return new ApiException(400, ErrorCodes.VALIDATION_ERROR, message, {
      [field]: message,
    });
  }
}
