import { Injectable } from '@nestjs/common';

@Injectable()
export class SecurityService {
  getSecurityStatus() {
    return {
      hookActive: true,
      rulesLoaded: true,
      lastUpdate: new Date().toISOString()
    };
  }

  getSecurityRules() {
    return {
      allowedCommands: ['ls', 'cat', 'pwd'],
      deniedCommands: ['rm -rf', 'sudo'],
      reviewCommands: ['git', 'npm']
    };
  }

  reloadRules() {
    return {
      success: true,
      message: 'Security rules reloaded',
      timestamp: new Date().toISOString()
    };
  }
}