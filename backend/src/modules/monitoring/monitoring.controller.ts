import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { CreateEventDto, EventStatsDto, RiskLevel, EventStatus } from './dto';
import { WebSocketGateway } from '../websocket/websocket.gateway';

// 审批状态管理
interface PendingApproval {
  id: string;
  sessionId: string;
  command: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'denied';
  reason?: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

@ApiTags('monitoring')
@Controller('api/monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly webSocketGateway: WebSocketGateway
  ) {}

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

  @Post('approval-request')
  @ApiOperation({ summary: '处理Hook审批请求' })
  async handleApprovalRequest(@Body() approvalData: any) {
    console.log('🔔 收到Hook审批请求:', approvalData);

    // 生成唯一的审批ID
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 存储待审批请求
    const pendingApproval: PendingApproval = {
      id: approvalId,
      sessionId: approvalData.sessionId,
      command: approvalData.command,
      timestamp: new Date(),
      status: 'pending',
      reason: approvalData.context?.ruleEngine?.reason || '需要审批的命令'
    };

    pendingApprovals.set(approvalId, pendingApproval);

    // 广播审批请求到前端（用于弹出审批框）
    this.webSocketGateway.broadcastApprovalRequest({
      approvalId: approvalId,
      sessionId: approvalData.sessionId,
      command: approvalData.command,
      agent: approvalData.agentType,
      risk: approvalData.context?.ruleEngine?.action === 'review' ? 'MEDIUM' : 'HIGH',
      cwd: process.cwd(),
      reason: approvalData.context?.ruleEngine?.reason || '需要审批的命令',
      timestamp: approvalData.timestamp
    });

    // 🔔 发送event_update事件到前端（用于更新事件列表）
    this.webSocketGateway.server.emit('event_update', {
      approvalId: approvalId,
      command: approvalData.command,
      agent: approvalData.agentType || 'Claude Code',
      sessionId: approvalData.sessionId,
      risk: approvalData.context?.ruleEngine?.action === 'review' ? 'MEDIUM' : 'HIGH',
      cwd: process.cwd(),
      reason: approvalData.context?.ruleEngine?.reason || '命令事件',
      action: approvalData.context?.ruleEngine?.action || 'unknown',
      status: 'pending'
    });

    // 创建监控事件
    const event = await this.monitoringService.createEvent({
      command: approvalData.command,
      agent: approvalData.agentType || 'Claude Code',
      sessionId: approvalData.sessionId,
      risk: RiskLevel.MEDIUM,
      status: EventStatus.PENDING,
      description: approvalData.context?.ruleEngine?.reason || '待审批命令'
    });

    // 返回审批ID供Hook轮询使用
    return {
      success: true,
      message: '审批请求已创建，等待用户决定',
      approvalId: approvalId,
      sessionId: approvalData.sessionId,
      eventId: event.data.id
    };
  }

  @Get('approval-status/:approvalId')
  @ApiOperation({ summary: '查询审批状态' })
  getApprovalStatus(@Param('approvalId') approvalId: string) {
    const approval = pendingApprovals.get(approvalId);

    if (!approval) {
      return {
        success: false,
        message: '审批请求不存在',
        status: 'not_found'
      };
    }

    return {
      success: true,
      approvalId: approvalId,
      status: approval.status,
      command: approval.command,
      reason: approval.reason,
      timestamp: approval.timestamp
    };
  }

  @Post('approval-decision/:approvalId')
  @ApiOperation({ summary: '处理审批决定' })
  async handleApprovalDecision(
    @Param('approvalId') approvalId: string,
    @Body() decision: { action: 'approve' | 'deny', reason?: string }
  ) {
    console.log(`🔔 收到审批决定请求: ${approvalId} -> ${decision.action}`);

    const approval = pendingApprovals.get(approvalId);

    if (!approval) {
      console.error(`❌ 审批请求不存在: ${approvalId}`);
      return {
        success: false,
        message: '审批请求不存在'
      };
    }

    if (approval.status !== 'pending') {
      console.error(`❌ 审批已处理: ${approvalId} 当前状态: ${approval.status}`);
      return {
        success: false,
        message: '审批已处理，无法重复操作'
      };
    }

    // 更新审批状态
    approval.status = decision.action === 'approve' ? 'approved' : 'denied';
    approval.reason = decision.reason || approval.reason;

    pendingApprovals.set(approvalId, approval);

    console.log(`✅ 审批决定已更新: ${approvalId} -> ${approval.status}`);
    console.log(`📊 当前待审批数量: ${pendingApprovals.size}`);

    // 广播审批结果到前端
    this.webSocketGateway.server.emit('approval_decision', {
      approvalId: approvalId,
      status: approval.status,
      command: approval.command,
      reason: approval.reason
    });

    console.log(`📡 已广播审批结果到前端: ${approvalId}`);

    // 5分钟后清理已处理的审批记录
    setTimeout(() => {
      pendingApprovals.delete(approvalId);
      console.log(`🗑️ 清理审批记录: ${approvalId}`);
    }, 5 * 60 * 1000);

    return {
      success: true,
      approvalId: approvalId,
      status: approval.status,
      message: `命令已${approval.status === 'approved' ? '批准' : '拒绝'}`
    };
  }
}