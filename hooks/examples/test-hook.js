#!/usr/bin/env node

// 最简单的测试Hook，只做JSON透传
let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  raw += chunk;
});

process.stdin.on('end', () => {
  try {
    // 验证是否是有效JSON
    const parsed = JSON.parse(raw);

    // 原样输出，不做任何修改
    process.stdout.write(raw);
  } catch (error) {
    // 如果JSON无效，也原样输出
    process.stdout.write(raw);
  }
});