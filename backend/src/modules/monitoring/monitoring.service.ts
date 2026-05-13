import { Injectable } from '@nestjs/common';
import { EventManagerService } from './event-manager.service';
import { CreateEventDto, EventStatsDto, EventStatus } from './dto';

@Injectable()
export class MonitoringService {
  constructor(private readonly eventManager: EventManagerService) {}

  async getStats(): Promise<EventStatsDto> {
    return this.eventManager.getStats();
  }

  getEvents(offset = 0, limit?: number) {
    const addReason = (e: any) => ({ ...e, reason: e.description });
    if (limit !== undefined) {
      const { events, total } = this.eventManager.getEventsPaged(offset, limit);
      return { success: true, data: events.map(addReason), total, offset, limit, timestamp: new Date().toISOString() };
    }
    return {
      success: true,
      data: this.eventManager.getEvents().map(addReason),
      timestamp: new Date().toISOString(),
    };
  }

  getEvent(id: string) {
    const event = this.eventManager.getEvent(id);
    return {
      success: !!event,
      data: event,
      timestamp: new Date().toISOString(),
    };
  }

  createEvent(createEventDto: CreateEventDto) {
    const eventId = this.eventManager.addEvent(createEventDto);
    return {
      success: true,
      data: { id: eventId },
      timestamp: new Date().toISOString(),
    };
  }

  updateEventStatus(eventId: string, status: EventStatus) {
    const updated = this.eventManager.updateEventStatus(eventId, status);
    return {
      success: updated,
      data: { updated },
      timestamp: new Date().toISOString(),
    };
  }

  updateEventAiAnalysis(approvalId: string, aiAnalysis: any): boolean {
    return this.eventManager.updateEventAiAnalysis(approvalId, aiAnalysis);
  }

  getSessions() {
    return {
      success: true,
      data: this.eventManager.getSessions(),
      timestamp: new Date().toISOString(),
    };
  }

  getAgents() {
    return {
      success: true,
      data: this.eventManager.getAgents(),
      timestamp: new Date().toISOString(),
    };
  }

  healthCheck() {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    return {
      success: true,
      data: {
        status: 'healthy',
        uptime,
        memory,
        timestamp: new Date().toISOString(),
        version: '2.0.0-nestjs',
      },
    };
  }
}