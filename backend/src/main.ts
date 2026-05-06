import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 启用全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // CORS: 开发时允许 Vite dev server；生产时前端由 NestJS 同源托管，Hook 用 curl 不需要 CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:3001'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Swagger API文档配置
  const config = new DocumentBuilder()
    .setTitle('Aegis Security Monitor')
    .setDescription('AI Agent安全监控系统API')
    .setVersion('2.0')
    .addTag('security')
    .addTag('monitoring')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log('🛡️ Aegis Security Monitor (NestJS) 已启动');
  console.log(`🌐 API服务: http://localhost:${port}`);
  console.log(`📚 API文档: http://localhost:${port}/api`);
}

bootstrap();