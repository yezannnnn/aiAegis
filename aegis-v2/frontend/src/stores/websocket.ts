import { defineStore } from 'pinia'
import { io, Socket } from 'socket.io-client'
import type { SecurityEvent, EventStats, Session, Agent } from '@/types'
import { ElNotification, ElMessageBox } from 'element-plus'

interface WebSocketState {
  socket: Socket | null
  connected: boolean
  stats: EventStats
  events: SecurityEvent[]
  sessions: Session[]
  agents: Agent[]
}

export const useWebSocketStore = defineStore('websocket', {
  state: (): WebSocketState => ({
    socket: null,
    connected: false,
    stats: {
      total: 0,
      blocked: 0,
      allowed: 0,
      warning: 0,
      pending: 0,
    },
    events: [],
    sessions: [],
    agents: [],
  }),

  actions: {
    connect() {
      if (this.socket) return

      const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'

      this.socket = io(`${socketUrl}/monitor`, {
        transports: ['websocket'],
        autoConnect: true,
      })

      this.socket.on('connect', () => {
        console.log('🔌 WebSocket 连接已建立')
        this.connected = true
        ElNotification({
          title: '连接成功',
          message: 'WebSocket 连接已建立',
          type: 'success',
          position: 'bottom-right',
        })
      })

      this.socket.on('disconnect', () => {
        console.log('📡 WebSocket 连接断开')
        this.connected = false
        ElNotification({
          title: '连接断开',
          message: 'WebSocket 连接已断开，正在尝试重连...',
          type: 'warning',
          position: 'bottom-right',
        })
      })

      this.socket.on('initial_state', (data) => {
        console.log('📊 收到初始状态:', data)
        this.stats = data.stats
        this.events = data.events
        this.sessions = data.sessions
        this.agents = data.agents
      })

      this.socket.on('new_event', (data) => {
        console.log('🚨 新安全事件:', data.data)
        this.events.unshift(data.data)
        // 保持最多200个事件
        if (this.events.length > 200) {
          this.events = this.events.slice(0, 200)
        }
        this.updateStats()
      })

      this.socket.on('session_update', (data) => {
        console.log('🔄 会话更新:', data.data)
        const index = this.sessions.findIndex(s => s.id === data.data.id)
        if (index >= 0) {
          this.sessions[index] = data.data
        } else {
          this.sessions.push(data.data)
        }
      })

      this.socket.on('agent_update', (data) => {
        console.log('🤖 代理更新:', data.data)
        const index = this.agents.findIndex(a => a.type === data.data.type)
        if (index >= 0) {
          this.agents[index] = data.data
        } else {
          this.agents.push(data.data)
        }
      })

      this.socket.on('approval_request', (data) => {
        console.log('🔔 审批请求:', data)
        this.handleApprovalRequest(data)
      })

      this.socket.on('approval_resolved', (data) => {
        console.log('✅ 审批已处理:', data)
        ElNotification({
          title: '审批结果',
          message: `命令 ${data.approved ? '已批准' : '已拒绝'}`,
          type: data.approved ? 'success' : 'warning',
          position: 'bottom-right',
        })
      })
    },

    disconnect() {
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
        this.connected = false
      }
    },

    async handleApprovalRequest(approvalData: any) {
      try {
        const result = await ElMessageBox.confirm(
          `
          <div style="margin-bottom: 12px;">
            <strong>命令:</strong> <code>${approvalData.command}</code>
          </div>
          <div style="margin-bottom: 12px;">
            <strong>AI代理:</strong> ${approvalData.agent}
          </div>
          <div style="margin-bottom: 12px;">
            <strong>风险级别:</strong>
            <span style="color: ${this.getRiskColor(approvalData.risk)}">${approvalData.risk}</span>
          </div>
          <div>
            <strong>检测原因:</strong> ${approvalData.description || approvalData.reason || '安全检查'}
          </div>
          `,
          '🛡️ 命令审批请求',
          {
            confirmButtonText: '批准执行',
            cancelButtonText: '拒绝执行',
            dangerouslyUseHTMLString: true,
            type: 'warning',
            customClass: 'approval-dialog',
          }
        )

        this.sendApprovalResponse(approvalData.sessionId, true)
      } catch {
        this.sendApprovalResponse(approvalData.sessionId, false, '用户拒绝')
      }
    },

    sendApprovalResponse(sessionId: string, approved: boolean, reason?: string) {
      if (this.socket) {
        this.socket.emit('approval_response', {
          sessionId,
          approved,
          reason,
        })
      }
    },

    getRiskColor(risk: string): string {
      const colors = {
        LOW: '#67C23A',
        MEDIUM: '#E6A23C',
        HIGH: '#F56C6C',
        CRITICAL: '#F56C6C',
      }
      return colors[risk as keyof typeof colors] || '#909399'
    },

    updateStats() {
      const events = this.events
      this.stats = {
        total: events.length,
        blocked: events.filter(e => e.status === 'blocked').length,
        allowed: events.filter(e => e.status === 'approved').length,
        warning: events.filter(e => e.risk === 'MEDIUM').length,
        pending: events.filter(e => e.status === 'pending').length,
      }
    },
  },
})