import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { SecurityModule } from './modules/security/security.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { WebSocketGatewayModule } from './modules/websocket/websocket.module';
import { RulesModule } from './modules/rules/rules.module';

// 前端 dist 目录（相对于编译后的 backend/dist/）
const frontendDistPath = join(__dirname, '..', '..', 'frontend', 'dist');
const hasFrontendDist = existsSync(join(frontendDistPath, 'index.html'));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 生产模式：frontend/dist 存在时由 NestJS 直接托管前端静态文件
    ...(hasFrontendDist ? [ServeStaticModule.forRoot({
      rootPath: frontendDistPath,
      exclude: ['/api/(.*)'],
    })] : []),

    MonitoringModule,
    SecurityModule,
    ApprovalModule,
    WebSocketGatewayModule,
    RulesModule,
  ],
})
export class AppModule {}
