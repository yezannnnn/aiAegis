import { Module, forwardRef } from '@nestjs/common';
import { WebSocketGateway } from './websocket.gateway';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [forwardRef(() => MonitoringModule)],
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketGatewayModule {}