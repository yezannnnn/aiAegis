import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService]
})
export class ApprovalModule {}