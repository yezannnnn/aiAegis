import { Injectable, OnModuleInit } from '@nestjs/common';
import { SecurityEvent } from '../monitoring/event-manager.service';

@Injectable()
export class SqliteStorageService implements OnModuleInit {
  private db: any = null;
  private readonly dbPath = process.env.SQLITE_PATH || './data/aegis.db';
  private _ready = false;

  async onModuleInit() {
    try {
      const path = require('path');
      const fs = require('fs');
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const sqlite3 = require('sqlite3').verbose();

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ SQLite connection failed:', err.message);
          this.db = null;
          return;
        }
        console.log('📄 SQLite connected:', this.dbPath);
      });

      if (this.db) {
        await this.initTables();
        console.log('✅ SQLite persistence ready:', this.dbPath);
        this._ready = true;
      }
    } catch (e) {
      console.error('❌ SQLite init failed:', e.message);
      this.db = null;
    }
  }

  isReady(): boolean {
    return this._ready && this.db !== null;
  }

  private async initTables() {
    if (!this.db) return;

    const run = (sql: string) => new Promise((resolve, reject) => {
      this.db.run(sql, (err) => err ? reject(err) : resolve(undefined));
    });

    await run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        agent TEXT NOT NULL,
        session_id TEXT NOT NULL,
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        timestamp TEXT NOT NULL,
        task_id TEXT,
        user_input TEXT,
        assist_prompt TEXT,
        matched_rules TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 兼容旧表：添加扩展列
    try { await run(`ALTER TABLE events ADD COLUMN task_id TEXT`); } catch {}
    try { await run(`ALTER TABLE events ADD COLUMN user_input TEXT`); } catch {}
    try { await run(`ALTER TABLE events ADD COLUMN assist_prompt TEXT`); } catch {}
    try { await run(`ALTER TABLE events ADD COLUMN matched_rules TEXT`); } catch {}
    try { await run(`ALTER TABLE events ADD COLUMN approval_id TEXT`); } catch {}
    try { await run(`ALTER TABLE events ADD COLUMN ai_analysis TEXT`); } catch {}

    await run(`
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        event_id TEXT,
        session_id TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        timestamp TEXT NOT NULL,
        decided_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent TEXT,
        last_command TEXT,
        event_count INTEGER DEFAULT 0,
        created_at TEXT,
        last_activity TEXT
      )
    `);

    await run(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`);
  }

  // ===== 事件操作 =====
  async saveEvent(event: SecurityEvent) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO events (id, command, agent, session_id, risk, status, description, timestamp, task_id, user_input, assist_prompt, matched_rules, approval_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.id, event.command, event.agent, event.sessionId, event.risk, event.status, event.description || '', event.timestamp, event.taskId || null, event.userInput || null, event.assistPrompt || null, JSON.stringify(event.matchedRules || []), event.approvalId || null],
        (err) => err ? reject(err) : resolve(undefined)
      );
    });
  }

  async updateEventAiAnalysis(approvalId: string, aiAnalysis: any) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE events SET ai_analysis = ? WHERE approval_id = ?',
        [JSON.stringify(aiAnalysis), approvalId],
        (err) => err ? reject(err) : resolve(undefined)
      );
    });
  }

  async updateEventStatus(id: string, status: string) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE events SET status = ? WHERE id = ?',
        [status, id],
        (err) => err ? reject(err) : resolve(undefined)
      );
    });
  }

  async getEvents(limit = 100): Promise<SecurityEvent[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, command, agent, session_id as sessionId, risk, status, description, timestamp, task_id as taskId, user_input as userInput, assist_prompt as assistPrompt, matched_rules as matchedRules, approval_id as approvalId, ai_analysis as aiAnalysis
         FROM events ORDER BY timestamp DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) return reject(err);
          // 解析 JSON 字段
          const parsed = (rows || []).map((r: any) => {
            if (typeof r.matchedRules === 'string') {
              try { r.matchedRules = JSON.parse(r.matchedRules); } catch { r.matchedRules = []; }
            }
            if (!r.matchedRules) r.matchedRules = [];
            if (typeof r.aiAnalysis === 'string') {
              try { r.aiAnalysis = JSON.parse(r.aiAnalysis); } catch { r.aiAnalysis = null; }
            }
            return r;
          });
          resolve(parsed);
        }
      );
    });
  }

  async getEventStats() {
    if (!this.db) return { total: 0, blocked: 0, allowed: 0, warning: 0, pending: 0, timed_out: 0 };
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
          SUM(CASE WHEN status = 'approved' OR status = 'allowed' THEN 1 ELSE 0 END) as allowed,
          SUM(CASE WHEN risk = 'MEDIUM' THEN 1 ELSE 0 END) as warning,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'timed_out' THEN 1 ELSE 0 END) as timed_out
        FROM events`,
        (err, row) => err ? reject(err) : resolve(row || { total: 0, blocked: 0, allowed: 0, warning: 0, pending: 0, timed_out: 0 })
      );
    });
  }

  // ===== 审批操作 =====
  async saveApproval(approval: {
    id: string;
    eventId?: string;
    sessionId: string;
    command: string;
    status: string;
    reason?: string;
    timestamp: string;
    decidedAt?: string;
  }) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO approvals (id, event_id, session_id, command, status, reason, timestamp, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [approval.id, approval.eventId || null, approval.sessionId, approval.command, approval.status, approval.reason || '', approval.timestamp, approval.decidedAt || null],
        (err) => err ? reject(err) : resolve(undefined)
      );
    });
  }

  async getApproval(id: string) {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM approvals WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row));
    });
  }

  async getPendingApprovals() {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, event_id as eventId, session_id as sessionId, command, status, reason, timestamp
         FROM approvals WHERE status = 'pending' ORDER BY timestamp DESC`,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });
  }

  // ===== 会话操作 =====
  async saveSession(session: { id: string; agent?: string; lastCommand?: string; eventCount?: number; createdAt?: string; lastActivity?: string }) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO sessions (id, agent, last_command, event_count, created_at, last_activity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [session.id, session.agent || '', session.lastCommand || '', session.eventCount || 0, session.createdAt || new Date().toISOString(), session.lastActivity || new Date().toISOString()],
        (err) => err ? reject(err) : resolve(undefined)
      );
    });
  }

  async getSessions(): Promise<any[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, agent, last_command as lastCommand, event_count as eventCount, created_at as createdAt, last_activity as lastActivity
         FROM sessions ORDER BY last_activity DESC`,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });
  }
}
