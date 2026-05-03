import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApprovalService } from './approval.service';

@Controller('approval')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get('pending')
  getPendingApprovals() {
    return this.approvalService.getPendingApprovals();
  }

  @Post(':sessionId/decision')
  makeDecision(@Param('sessionId') sessionId: string, @Body() decision: { action: 'allow' | 'deny', reason?: string }) {
    return this.approvalService.makeDecision(sessionId, decision);
  }

  @Get(':sessionId')
  getApproval(@Param('sessionId') sessionId: string) {
    return this.approvalService.getApproval(sessionId);
  }
}