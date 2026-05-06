import { Module } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [MonitoringModule],
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketGatewayModule {}