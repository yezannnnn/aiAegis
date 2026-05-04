import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum EventStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  BLOCKED = 'blocked'
}

export class CreateEventDto {
  @ApiProperty({ description: '执行的命令' })
  @IsString()
  command: string;

  @ApiProperty({ description: 'AI代理类型' })
  @IsString()
  agent: string;

  @ApiProperty({ enum: RiskLevel, description: '风险级别' })
  @IsEnum(RiskLevel)
  risk: RiskLevel;

  @ApiProperty({ enum: EventStatus, description: '事件状态' })
  @IsEnum(EventStatus)
  status: EventStatus;

  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: '用户上下文', required: false })
  @IsOptional()
  @IsObject()
  userContext?: any;

  @ApiProperty({ description: '意图描述', required: false })
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiProperty({ description: '描述信息', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class EventStatsDto {
  @ApiProperty({ description: '总事件数' })
  total: number;

  @ApiProperty({ description: '被阻止的事件数' })
  blocked: number;

  @ApiProperty({ description: '被允许的事件数' })
  allowed: number;

  @ApiProperty({ description: '警告事件数' })
  warning: number;

  @ApiProperty({ description: '待审批事件数' })
  pending: number;
}