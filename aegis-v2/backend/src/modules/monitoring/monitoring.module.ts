import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { EventManagerService } from './event-manager.service';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, EventManagerService],
  exports: [MonitoringService, EventManagerService],
})
export class MonitoringModule {}