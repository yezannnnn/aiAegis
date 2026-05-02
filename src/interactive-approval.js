#!/usr/bin/env node

/**
 * Aegis Interactive Approval System - 交互式命令审批
 * 实现用户确认高危命令的机制
 */

const readline = require('readline');

class InteractiveApproval {
  constructor() {
    this.pendingApprovals = new Map();
    this.approvalTimeouts = new Map();
  }

  /**
   * 🛡️ 请求用户批准高危命令
   */
  async requestApproval(eventData) {
    const { sessionId, command, risk, intent, agentType } = eventData;

    // 低风险命令直接允许
    if (risk === 'LOW' || risk === 'MEDIUM') {
      return {
        approved: true,
        reason: 'auto_approved_low_risk',
        timestamp: new Date().toISOString()
      };
    }

    // 高危命令需要用户确认
    if (risk === 'HIGH' || risk === 'CRITICAL') {
      return await this.showApprovalDialog(eventData);
    }

    return { approved: false, reason: 'unknown_risk_level' };
  }

  /**
   * 🔴 显示审批对话框
   */
  async showApprovalDialog(eventData) {
    const { command, risk, intent, agentType, sessionId } = eventData;

    console.log('\n🚨 HIGH RISK COMMAND DETECTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Command: ${command}`);
    console.log(`🛡️ Risk Level: ${risk}`);
    console.log(`🎯 Intent: ${intent}`);
    console.log(`🤖 Agent: ${agentType}`);
    console.log(`🔗 Session: ${sessionId.substring(0, 8)}...`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 风险警告
    this.showRiskWarning(intent);

    console.log('\n❓ Do you want to allow this command?');
    console.log('   [y] Yes, allow and execute');
    console.log('   [n] No, block this command');
    console.log('   [i] Show more info');
    console.log('   [q] Quit and block all');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      // 30秒超时，默认拒绝
      const timeout = setTimeout(() => {
        rl.close();
        console.log('\n⏰ Timeout reached, command BLOCKED for safety');
        resolve({
          approved: false,
          reason: 'timeout_block',
          timestamp: new Date().toISOString()
        });
      }, 30000);

      const askQuestion = () => {
        rl.question('Your choice [y/n/i/q]: ', (answer) => {
          const choice = answer.toLowerCase().trim();

          switch (choice) {
            case 'y':
            case 'yes':
              clearTimeout(timeout);
              rl.close();
              console.log('✅ Command APPROVED by user');
              resolve({
                approved: true,
                reason: 'user_approved',
                timestamp: new Date().toISOString()
              });
              break;

            case 'n':
            case 'no':
              clearTimeout(timeout);
              rl.close();
              console.log('❌ Command BLOCKED by user');
              resolve({
                approved: false,
                reason: 'user_blocked',
                timestamp: new Date().toISOString()
              });
              break;

            case 'i':
            case 'info':
              this.showDetailedInfo(eventData);
              askQuestion(); // 继续询问
              break;

            case 'q':
            case 'quit':
              clearTimeout(timeout);
              rl.close();
              console.log('🛑 Quitting - all commands will be blocked');
              process.exit(0);
              break;

            default:
              console.log('❓ Invalid choice. Please enter y, n, i, or q');
              askQuestion(); // 重新询问
          }
        });
      };

      askQuestion();
    });
  }

  /**
   * ⚠️ 显示风险警告
   */
  showRiskWarning(intent) {
    const warnings = {
      'file_deletion_detected': [
        '🔥 This command will DELETE FILES PERMANENTLY',
        '💀 Data loss risk is EXTREMELY HIGH',
        '🚫 This operation cannot be undone'
      ],
      'system_modification_detected': [
        '🔧 This command will modify system configuration',
        '⚠️ May affect system stability',
        '🔒 Could change security settings'
      ],
      'network_security_risk': [
        '🌐 This command involves network operations',
        '🕵️ Potential security or privacy risk',
        '📡 May expose sensitive information'
      ],
      'package_installation_detected': [
        '📦 This command will install external packages',
        '🦠 Unknown packages may contain malware',
        '🔓 Could introduce security vulnerabilities'
      ]
    };

    const warning = warnings[intent] || [
      '⚠️ This command has been flagged as potentially dangerous',
      '🎯 Please review carefully before proceeding',
      '🛡️ Consider if this action is really necessary'
    ];

    console.log('\n🚨 RISK ANALYSIS:');
    warning.forEach(w => console.log(`   ${w}`));
  }

  /**
   * 📊 显示详细信息
   */
  showDetailedInfo(eventData) {
    const { command, risk, intent, agentType, sessionId, context } = eventData;

    console.log('\n📊 DETAILED INFORMATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Full Command: ${command}`);
    console.log(`Risk Assessment: ${risk}`);
    console.log(`Detected Intent: ${intent}`);
    console.log(`Agent Type: ${agentType}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Working Directory: ${context?.cwd || 'unknown'}`);
    console.log(`User: ${context?.user || 'unknown'}`);
    console.log(`Project: ${context?.project || 'unknown'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

module.exports = InteractiveApproval;

// CLI 使用示例
if (require.main === module) {
  const approval = new InteractiveApproval();

  // 模拟高危命令审批
  const testEvent = {
    sessionId: '577a05f7-648e-4d1d-bc7c-c8c6e472f6df',
    command: 'rm -rf /important-files',
    risk: 'HIGH',
    intent: 'file_deletion_detected',
    agentType: 'claude-code',
    context: {
      cwd: '/Users/yuhao/Desktop',
      user: 'yuhao',
      project: 'test-project'
    }
  };

  console.log('🧪 Testing Interactive Approval System...\n');
  approval.requestApproval(testEvent).then(result => {
    console.log('\n📋 Approval Result:', result);
  });
}