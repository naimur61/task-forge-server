import { Module } from '@nestjs/common';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

/** Project members API. */
@Module({
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
