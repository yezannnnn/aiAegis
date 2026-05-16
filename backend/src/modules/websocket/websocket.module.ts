import { Module, forwardRef } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ApprovalModule } from '../approval/approval.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [forwardRef(() => MonitoringModule), forwardRef(() => ApprovalModule), StorageModule],
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketGatewayModule {}