# Aegis 监控与工具

## 目录说明
存放各种监控工具、实用脚本和开发工具。

## 文件说明

### 监控工具
- **modern-web-monitor.js** - 现代化Web监控界面
- **monitor-ts.js** - TypeScript监控工具  
- **real-time-monitor.js** - 实时监控服务
- **rule-engine.js** - 规则引擎核心逻辑

## 使用方法

### 启动实时监控
```bash
node tools/real-time-monitor.js
```
- 默认端口: 3001
- Web界面: http://localhost:3001

### 启动现代化监控
```bash
node tools/modern-web-monitor.js
```

### TypeScript监控
```bash
node tools/monitor-ts.js
```

## 开发说明
- 这些工具可独立运行
- 与Aegis后端API集成
- 支持WebSocket实时通信

## 注意事项
- 确保后端服务已启动 (port 3001)
- Node.js版本要求: 16+