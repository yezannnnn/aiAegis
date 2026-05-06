/**
 * 双向同步模块 - Claude原生审批 & 3001界面审批同步
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DualApprovalState } from './types';
import { EventEmitter } from 'events';

export class DualSync extends EventEmitter {
  private syncFile: string;
  private fileWatcher: fs.FSWatcher | null = null;
  private isInitialized = false;

  constructor() {
    super();
    this.syncFile = path.join(os.homedir(), '.aegis', 'approval-sync.json');
  }

  /**
   * 初始化双向同步
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // 确保目录存在
    const syncDir = path.dirname(this.syncFile);
    if (!fs.existsSync(syncDir)) {
      fs.mkdirSync(syncDir, { recursive: true });
    }

    // 监控同步文件变化
    this.startFileWatcher();

    this.isInitialized = true;
    console.log('🔄 双向审批同步已启用');
  }

  /**
   * 启动文件监控
   */
  private startFileWatcher(): void {
    try {
      // 如果文件不存在，创建空文件
      if (!fs.existsSync(this.syncFile)) {
        fs.writeFileSync(this.syncFile, JSON.stringify({}, null, 2));
      }

      this.fileWatcher = fs.watch(this.syncFile, (eventType) => {
        if (eventType === 'change') {
          this.handleSyncFileChange();
        }
      });

      console.log('📁 同步文件监控已启动:', this.syncFile);

    } catch (error) {
      console.error('启动文件监控失败:', error);
    }
  }

  /**
   * 处理同步文件变化
   */
  private handleSyncFileChange(): void {
    try {
      const syncData = this.readSyncFile();

      if (!syncData || !syncData.sessionId) {
        return;
      }

      // 检查是否有来自Claude原生的决定
      if (syncData.source === 'claude-native' && syncData.status !== 'pending') {
        console.log(`🔄 [Dual Sync] Claude原生决定: ${syncData.sessionId.substring(0, 8)}... - ${syncData.status}`);

        // 发出同步事件
        this.emit('claude_native_decision', {
          sessionId: syncData.sessionId,
          status: syncData.status,
          source: 'claude-native',
          reason: syncData.reason,
          timestamp: syncData.timestamp
        });
      }

      // 检查是否有来自Web界面的决定
      if (syncData.source === 'web' && syncData.status !== 'pending') {
        console.log(`🔄 [Dual Sync] Web界面决定: ${syncData.sessionId.substring(0, 8)}... - ${syncData.status}`);

        // 发出同步事件
        this.emit('web_interface_decision', {
          sessionId: syncData.sessionId,
          status: syncData.status,
          source: 'web',
          reason: syncData.reason,
          timestamp: syncData.timestamp
        });
      }

    } catch (error) {
      console.error('[Dual Sync] 处理同步文件变化失败:', error);
    }
  }

  /**
   * 创建双向审批状态
   */
  createDualApprovalState(sessionId: string, command: string, description: string): DualApprovalState {
    const approvalState: DualApprovalState = {
      sessionId,
      command,
      description,
      status: 'pending',
      source: null,
      timestamp: new Date().toISOString(),
      claudeNative: 'waiting',
      webInterface: 'waiting'
    };

    this.writeSyncFile(approvalState);

    console.log(`🔄 [Dual Sync] 创建双向审批: ${sessionId.substring(0, 8)}... - ${command}`);

    return approvalState;
  }

  /**
   * 更新双向审批状态
   */
  updateDualApprovalStatus(
    sessionId: string,
    status: 'approved' | 'denied',
    source: 'claude-native' | 'web',
    reason?: string
  ): boolean {
    try {
      const syncData = this.readSyncFile();

      if (!syncData || syncData.sessionId !== sessionId) {
        console.error(`[Dual Sync] 找不到会话: ${sessionId}`);
        return false;
      }

      // 更新状态
      syncData.status = status;
      syncData.source = source;
      syncData.reason = reason;
      syncData.timestamp = new Date().toISOString();

      // 更新对应界面的状态
      if (source === 'claude-native') {
        syncData.claudeNative = status;
      } else if (source === 'web') {
        syncData.webInterface = status;
      }

      this.writeSyncFile(syncData);

      console.log(`🔄 [Dual Sync] 状态已更新: ${sessionId.substring(0, 8)}... - ${status} by ${source}`);

      // 发出状态更新事件
      this.emit('dual_approval_updated', {
        sessionId,
        status,
        source,
        reason,
        timestamp: syncData.timestamp
      });

      return true;

    } catch (error) {
      console.error('[Dual Sync] 更新状态失败:', error);
      return false;
    }
  }

  /**
   * 获取同步状态
   */
  getSyncState(sessionId?: string): DualApprovalState | null {
    try {
      const syncData = this.readSyncFile();

      if (!syncData) {
        return null;
      }

      if (sessionId && syncData.sessionId !== sessionId) {
        return null;
      }

      return syncData;

    } catch (error) {
      console.error('[Dual Sync] 获取同步状态失败:', error);
      return null;
    }
  }

  /**
   * 清理同步状态
   */
  clearSyncState(sessionId?: string): boolean {
    try {
      if (sessionId) {
        const syncData = this.readSyncFile();
        if (syncData && syncData.sessionId === sessionId) {
          fs.writeFileSync(this.syncFile, JSON.stringify({}, null, 2));
          console.log(`🔄 [Dual Sync] 清理同步状态: ${sessionId.substring(0, 8)}...`);
          return true;
        }
        return false;
      } else {
        fs.writeFileSync(this.syncFile, JSON.stringify({}, null, 2));
        console.log('🔄 [Dual Sync] 清理所有同步状态');
        return true;
      }

    } catch (error) {
      console.error('[Dual Sync] 清理同步状态失败:', error);
      return false;
    }
  }

  /**
   * 读取同步文件
   */
  private readSyncFile(): DualApprovalState | null {
    try {
      if (!fs.existsSync(this.syncFile)) {
        return null;
      }

      const content = fs.readFileSync(this.syncFile, 'utf8');
      const data = JSON.parse(content);

      // 检查是否为有效的同步数据
      if (!data.sessionId) {
        return null;
      }

      return data as DualApprovalState;

    } catch (error) {
      console.error('[Dual Sync] 读取同步文件失败:', error);
      return null;
    }
  }

  /**
   * 写入同步文件
   */
  private writeSyncFile(data: DualApprovalState): void {
    try {
      fs.writeFileSync(this.syncFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Dual Sync] 写入同步文件失败:', error);
      throw error;
    }
  }

  /**
   * 检查同步健康状态
   */
  checkSyncHealth(): { healthy: boolean; message: string } {
    try {
      // 检查同步文件是否可访问
      if (!fs.existsSync(this.syncFile)) {
        return { healthy: false, message: '同步文件不存在' };
      }

      // 检查文件权限
      fs.accessSync(this.syncFile, fs.constants.R_OK | fs.constants.W_OK);

      // 检查文件监控是否正常
      if (!this.fileWatcher) {
        return { healthy: false, message: '文件监控未启动' };
      }

      return { healthy: true, message: '同步系统正常' };

    } catch (error) {
      return {
        healthy: false,
        message: `同步系统错误: ${(error as Error).message}`
      };
    }
  }

  /**
   * 停止双向同步
   */
  stop(): void {
    console.log('🔄 正在停止双向同步...');

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    this.isInitialized = false;
    console.log('🔄 双向同步已停止');
  }

  /**
   * 获取同步统计
   */
  getStats() {
    const syncState = this.getSyncState();
    const health = this.checkSyncHealth();

    return {
      initialized: this.isInitialized,
      syncFile: this.syncFile,
      currentState: syncState ? {
        sessionId: syncState.sessionId.substring(0, 8) + '...',
        status: syncState.status,
        source: syncState.source
      } : null,
      health
    };
  }
}