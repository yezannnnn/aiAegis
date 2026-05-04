import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { WebSocketGatewayModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 业务模块
    MonitoringModule,
    WebSocketGatewayModule,
  ],
})
export class AppModule {}