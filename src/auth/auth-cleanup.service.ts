import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/** Deletes expired refresh tokens and password-reset tokens once a day. */
@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Removes tokens that can no longer be used. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    const now = new Date();
    const [refresh, resets] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.passwordReset.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);
    this.logger.log(
      `Purged ${refresh.count} refresh and ${resets.count} reset tokens`,
    );
  }
}
