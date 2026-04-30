/**
 * Approval Queue — manages pending approval requests from Agents.
 */

import { ApprovalRequest, ApprovalResolution, Decision } from "../types";
import { EventEmitter } from "events";

export class ApprovalQueue extends EventEmitter {
  private pending: ApprovalRequest[] = [];
  private history: ApprovalResolution[] = [];
  private sessionAllowlist: Map<string, Set<string>> = new Map();

  /** Maximum history entries to keep */
  private maxHistory = 200;

  /** Add a request to the pending queue */
  enqueue(request: ApprovalRequest): void {
    this.pending.push(request);
    this.emit("queue-updated", this.pending.length);
    this.emit("new-request", request);
  }

  /** Resolve a pending request */
  resolve(id: string, decision: Decision): ApprovalResolution | null {
    const idx = this.pending.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    const request = this.pending[idx];
    this.pending.splice(idx, 1);

    const resolution: ApprovalResolution = {
      id,
      decision,
      resolvedAt: Date.now(),
    };

    // Track session-level approvals
    if (decision === "ALLOW_SESSION" && request.sessionKey && request.triggeredRule) {
      if (!this.sessionAllowlist.has(request.sessionKey)) {
        this.sessionAllowlist.set(request.sessionKey, new Set());
      }
      this.sessionAllowlist.get(request.sessionKey)!.add(request.triggeredRule.description);
    }

    // Add to history
    this.history.unshift(resolution);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }

    this.emit("queue-updated", this.pending.length);
    this.emit("resolved", resolution, request);
    return resolution;
  }

  /** Get all pending requests */
  getPending(): ApprovalRequest[] {
    return [...this.pending];
  }

  /** Get the number of pending requests */
  pendingCount(): number {
    return this.pending.length;
  }

  /** Get recent history */
  getHistory(limit: number = 30): ApprovalResolution[] {
    return this.history.slice(0, limit);
  }

  /** Check if a command is already allowed for this session */
  isSessionAllowed(sessionKey: string | undefined, description: string | undefined): boolean {
    if (!sessionKey || !description) return false;
    return this.sessionAllowlist.get(sessionKey)?.has(description) ?? false;
  }

  /** Clear session state */
  clearSession(sessionKey: string): void {
    this.sessionAllowlist.delete(sessionKey);
  }

  /** Clear all state */
  clear(): void {
    this.pending = [];
    this.history = [];
    this.sessionAllowlist.clear();
    this.emit("queue-updated", 0);
  }
}
