import { Controller, Get, Post, Body } from '@nestjs/common';
import { SecurityService } from './security.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Get('status')
  getStatus() {
    return this.securityService.getSecurityStatus();
  }

  @Get('rules')
  getRules() {
    return this.securityService.getSecurityRules();
  }

  @Post('rules/reload')
  reloadRules() {
    return this.securityService.reloadRules();
  }
}