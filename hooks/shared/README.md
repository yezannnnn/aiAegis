# 共享组件

## 目录说明
存放各AI工具hook可共用的通用代码和工具库。

## 规划的组件

### aegis-core.js
- Aegis规则引擎核心逻辑
- 命令解析和风险评估
- 审批请求管理

### config-loader.js  
- 配置文件加载器
- 支持YAML/JSON格式
- 环境变量替换

### api-client.js
- Aegis后端API客户端
- HTTP请求封装
- 错误处理和重试

## 开发原则
- 保持API一致性
- 支持多AI工具复用
- 最小化依赖

## 使用示例
```javascript
const { evaluateCommand } = require('./shared/aegis-core.js');
const result = await evaluateCommand(command, context);
```