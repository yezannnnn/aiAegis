import { Module, forwardRef } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { StorageModule } from '../storage/storage.module';
import { ApprovalModule } from '../approval/approval.module';

@Module({
  imports: [forwardRef(() => MonitoringModule), StorageModule, forwardRef(() => ApprovalModule)],
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketGatewayModule {}