
# 🛡️ Aegis 当前端口配置

## 📊 服务端口分布
- **Web监控界面**: http://localhost:3001
- **WebSocket实时**: ws://localhost:8901
- **Hook拦截服务**: http://localhost:9876

## 🔧 环境变量覆盖
```bash
export AEGIS_WEB_PORT=3001
export AEGIS_WS_PORT=8901
export AEGIS_HOOK_PORT=9876
```

## ⚠️ 端口冲突解决
如遇端口冲突，Aegis会自动选择备用端口：
- WebSocket: 8901-8910 (避开常用开发端口3000-3009)
- Web: 3001-3009 (标准Web开发端口)
- Hook: 9876-9885 (高位端口，较少冲突)

生成时间: 2026/5/2 17:07:44
