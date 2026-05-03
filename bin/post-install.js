#!/usr/bin/env node

const chalk = require('chalk');
const path = require('path');

console.log('');
console.log(chalk.cyan('🛡️ Aegis Security Monitor'));
console.log(chalk.gray('感谢安装Aegis AI安全监控系统！'));
console.log('');
console.log(chalk.yellow('下一步:'));
console.log('');
console.log(chalk.white('1. 初始化系统:'));
console.log(chalk.cyan('   aegis setup'));
console.log('');
console.log(chalk.white('2. 启动服务:'));
console.log(chalk.cyan('   aegis start'));
console.log('');
console.log(chalk.white('3. 检查状态:'));
console.log(chalk.cyan('   aegis status'));
console.log('');
console.log(chalk.gray('文档: https://github.com/aegis-team/security-monitor'));
console.log(chalk.gray('帮助: aegis --help'));
console.log('');