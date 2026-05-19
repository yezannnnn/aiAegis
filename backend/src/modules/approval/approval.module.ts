import { Module, forwardRef } from '@nestjs/common';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { StorageModule } from '../storage/storage.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [StorageModule, forwardRef(() => MonitoringModule)],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService]
})
export class ApprovalModule {}