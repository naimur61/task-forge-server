import { Module } from '@nestjs/common';
import { LabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

/** Project labels API. */
@Module({
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
