import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

/** Task comments API. */
@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
