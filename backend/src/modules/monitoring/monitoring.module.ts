import { Module, forwardRef } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { EventManagerService } from './event-manager.service';
import { WebSocketGatewayModule } from '../websocket/websocket.module';

@Module({
  imports: [forwardRef(() => WebSocketGatewayModule)],
  controllers: [MonitoringController],
  providers: [MonitoringService, EventManagerService],
  exports: [MonitoringService, EventManagerService],
})
export class MonitoringModule {}