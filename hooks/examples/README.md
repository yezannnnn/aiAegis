# Hook开发示例

## 目录说明
包含各种hook开发的参考实现和测试工具。

## 文件说明

### test-hook.js
最小化hook示例，演示基本的JSON透传功能。适合作为新hook开发的起点。

## 开发指南

### Hook基本结构
```javascript
#!/usr/bin/env node
let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  // 处理逻辑
  process.stdout.write(result);
});
```

### 集成Aegis规则引擎
参考 `../claude-code/universal-hook-v2.js` 的实现方式。

### 调试技巧
- 使用JSON格式输入测试：`echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | node your-hook.js`
- 检查exit code：`echo $?`