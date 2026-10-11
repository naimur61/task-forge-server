import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

/** Tasks API. */
@Module({
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
