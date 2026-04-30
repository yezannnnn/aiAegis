#!/usr/bin/env node
/**
 * AST集成测试 - 验证增强的上下文信息
 *
 * 测试危险命令的AST解析和丰富上下文展示
 */

const { astEngine } = require('./dist/rules/ast-engine');

async function testCommand(command, description) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`测试: ${description}`);
  console.log(`命令: ${command}`);
  console.log(`${'='.repeat(80)}`);

  try {
    // 获取匹配结果
    const match = await astEngine.matchCommand(command, process.cwd());
    console.log('\n📊 匹配结果:');
    console.log(`  匹配: ${match.matched}`);
    console.log(`  严重性: ${match.severity || 'N/A'}`);
    console.log(`  描述: ${match.description || 'N/A'}`);

    if (match.metadata) {
      console.log(`  风险级别: ${match.metadata.riskLevel}`);
      console.log(`  风险分数: ${match.metadata.riskScore}`);
      console.log(`  置信度: ${match.metadata.confidence}`);
    }

    // 获取详细报告
    const report = await astEngine.getDetailedRiskReport(command, process.cwd());

    console.log('\n🔍 命令结构分析:');
    if (report.ast) {
      console.log(`  主命令: ${report.ast.binary}`);
      if (report.ast.subcommand) console.log(`  子命令: ${report.ast.subcommand}`);
      if (report.ast.flags && report.ast.flags.length > 0) {
        console.log(`  选项: ${report.ast.flags.map(f => `--${f.name}${f.value ? `=${f.value}` : ''}`).join(', ')}`);
      }
      if (report.ast.arguments && report.ast.arguments.length > 0) {
        console.log(`  参数: ${report.ast.arguments.join(', ')}`);
      }
    }

    console.log('\n🌍 环境上下文:');
    if (report.context) {
      const { git, project, system } = report.context;

      if (git && git.isRepo) {
        console.log(`  Git: ${git.currentBranch} 分支${git.isMainBranch ? ' (主分支)' : ''}`);
        if (git.hasUncommittedChanges) console.log(`    - 有未提交更改`);
        if (git.hasUnpushedCommits) console.log(`    - 有未推送提交`);
      }

      if (project && project.type !== 'unknown') {
        console.log(`  项目: ${project.type}${project.isProduction ? ' (生产环境)' : ''}`);
        if (project.hasDatabaseConfig) console.log(`    - 检测到数据库配置`);
      }

      if (system) {
        console.log(`  系统: ${system.platform}${system.hasRoot ? ' (管理员权限)' : ''}`);
      }
    }

    console.log('\n⚡ 风险评估:');
    if (report.assessment) {
      const { level, score, reasoning, impact, suggestions } = report.assessment;
      console.log(`  级别: ${level} (${score}/100)`);

      if (reasoning && reasoning.length > 0) {
        console.log('  原因:');
        reasoning.forEach(reason => console.log(`    • ${reason}`));
      }

      if (impact) {
        const impacts = [];
        if (impact.dataLoss) impacts.push('数据丢失');
        if (impact.systemDamage) impacts.push('系统损害');
        if (impact.securityRisk) impacts.push('安全风险');
        if (!impact.reversible) impacts.push('不可逆转');

        if (impacts.length > 0) {
          console.log(`  影响: ${impacts.join(', ')}`);
        }
      }

      if (suggestions && suggestions.alternatives && suggestions.alternatives.length > 0) {
        console.log('  建议替代方案:');
        suggestions.alternatives.forEach(alt => console.log(`    • ${alt}`));
      }
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

async function runTests() {
  console.log('🛡 Aegis AST集成测试');
  console.log('测试增强的上下文信息和风险评估');

  // 测试用例
  const testCases = [
    {
      command: 'git push --force origin main',
      description: 'Git强制推送到主分支 (应该是CRITICAL)'
    },
    {
      command: 'rm -rf node_modules',
      description: '删除node_modules (应该是MEDIUM)'
    },
    {
      command: 'git reset --hard HEAD~1',
      description: 'Git硬重置 (应该是HIGH)'
    },
    {
      command: 'mysql -e "DROP DATABASE production"',
      description: 'MySQL删除数据库 (应该是CRITICAL)'
    },
    {
      command: 'ls -la',
      description: '安全命令 (应该是SAFE)'
    },
    {
      command: 'git push --force-with-lease origin feature/test',
      description: 'Git安全强推到特性分支 (应该是LOW/MEDIUM)'
    }
  ];

  for (const testCase of testCases) {
    await testCommand(testCase.command, testCase.description);

    // 添加延迟以便阅读
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ 所有测试完成');
  console.log('\n💡 现在可以启动Aegis Monitor查看增强的界面:');
  console.log('   npm start -- monitor');
}

// 运行测试
runTests().catch(console.error);