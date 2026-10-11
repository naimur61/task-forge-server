import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Provides the Prisma client globally. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
