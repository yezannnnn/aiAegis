import { Module, forwardRef } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { EventManagerService } from './event-manager.service';
import { WebSocketGatewayModule } from '../websocket/websocket.module';
import { StorageModule } from '../storage/storage.module';
import { ApprovalModule } from '../approval/approval.module';

@Module({
  imports: [forwardRef(() => WebSocketGatewayModule), StorageModule, ApprovalModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, EventManagerService],
  exports: [MonitoringService, EventManagerService],
})
export class MonitoringModule {}