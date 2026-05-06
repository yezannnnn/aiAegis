import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { SecurityModule } from './modules/security/security.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { WebSocketGatewayModule } from './modules/websocket/websocket.module';
import { RulesModule } from './modules/rules/rules.module';

@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 业务模块
    MonitoringModule,
    SecurityModule,
    ApprovalModule,
    WebSocketGatewayModule,
    RulesModule,
  ],
})
export class AppModule {}