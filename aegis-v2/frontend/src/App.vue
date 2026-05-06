<template>
  <el-config-provider :locale="zhCn">
    <div id="app" class="app">
      <router-view />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useWebSocketStore } from '@/stores/websocket'

// 初始化WebSocket连接
const websocketStore = useWebSocketStore()
websocketStore.connect()
</script>

<style lang="scss">
html {
  height: 100%;
}

body {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: 'JetBrains Mono', 'Helvetica Neue', Helvetica, 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}

#app {
  height: 100%;
  background: var(--el-bg-color);
}

.app {
  height: 100%;
  overflow: hidden;
}
</style>