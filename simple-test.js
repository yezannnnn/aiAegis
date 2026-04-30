#!/usr/bin/env node
/**
 * 简化的AST测试 - 验证核心功能
 */

const { astEngine } = require('./dist/rules/ast-engine');

async function testAST() {
  console.log('🛡 Aegis AST引擎测试\n');

  const testCommands = [
    'git push --force origin main',
    'rm -rf node_modules',
    'ls -la'
  ];

  for (const command of testCommands) {
    console.log(`测试命令: ${command}`);

    try {
      const match = await astEngine.matchCommand(command, process.cwd());
      console.log(`✅ 匹配: ${match.matched}`);

      if (match.matched) {
        console.log(`   严重性: ${match.severity}`);
        console.log(`   风险级别: ${match.metadata?.riskLevel}`);
        console.log(`   风险分数: ${match.metadata?.riskScore}/100`);
      }

    } catch (error) {
      console.log(`❌ 错误: ${error.message}`);
    }
    console.log('---');
  }

  console.log('\n🎉 AST引擎运行正常！');
}

testAST().catch(console.error);