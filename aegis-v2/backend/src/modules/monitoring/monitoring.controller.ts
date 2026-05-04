import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { CreateEventDto, EventStatsDto } from './dto';

@ApiTags('monitoring')
@Controller('api/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('stats')
  @ApiOperation({ summary: '获取监控统计信息' })
  @ApiResponse({ status: 200, description: '统计信息', type: EventStatsDto })
  getStats(): EventStatsDto {
    return this.monitoringService.getStats();
  }

  @Get('events')
  @ApiOperation({ summary: '获取所有安全事件' })
  getEvents() {
    return this.monitoringService.getEvents();
  }

  @Get('events/:id')
  @ApiOperation({ summary: '获取特定事件详情' })
  getEvent(@Param('id') id: string) {
    return this.monitoringService.getEvent(id);
  }

  @Post('events')
  @ApiOperation({ summary: '创建新的安全事件' })
  createEvent(@Body() createEventDto: CreateEventDto) {
    return this.monitoringService.createEvent(createEventDto);
  }

  @Get('sessions')
  @ApiOperation({ summary: '获取活跃会话' })
  getSessions() {
    return this.monitoringService.getSessions();
  }

  @Get('agents')
  @ApiOperation({ summary: '获取活跃代理' })
  getAgents() {
    return this.monitoringService.getAgents();
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  healthCheck() {
    return this.monitoringService.healthCheck();
  }
}