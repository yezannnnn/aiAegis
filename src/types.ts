/**
 * Core types for Aegis — AI Agent dangerous operation interceptor.
 */

// =========================================================================
// Rule System (ESLint-like: rule packages define patterns, users set severity)
// =========================================================================

/** Rule severity levels */
export type RuleSeverity = "block" | "error" | "warn" | "off";

/**
 * Rule definition — provided by rule packages (aegis/recommended, community).
 * Users do NOT write these; they only reference them by description in their config.
 */
export interface RuleDef {
  /** Regex pattern to match against the command */
  pattern: string;
  /** Human-readable description — doubles as the rule ID for overrides */
  description: string;
  /** Category for grouping in Monitor */
  category?: string;
  /** Default severity set by the rule package */
  defaultSeverity: RuleSeverity;
  /** Source package name */
  source?: string;
}

/**
 * Rule package — what community authors publish.
 */
export interface RulePackage {
  name: string;
  version: string;
  rules: RuleDef[];
}

/**
 * User's rule overrides — ESLint-style.
 * Key = rule description (matching RuleDef.description), value = severity.
 */
export type UserRuleOverrides = Record<string, RuleSeverity>;

/**
 * Resolved rule — RuleDef + effective severity after user overrides.
 */
export interface ResolvedRule {
  def: RuleDef;
  severity: RuleSeverity; // effective severity (defaultSeverity overridden by user config)
}

// =========================================================================
// Agent Integration
// =========================================================================

export type AgentType = "hermes" | "openclaw" | "claude-code";

// =========================================================================
// Approval System
// =========================================================================

export type Decision = "ALLOW" | "DENY" | "ALLOW_SESSION" | "ALLOW_ALWAYS";

export interface ApprovalRequest {
  id: string;
  command: string;
  argv?: string[];
  cwd?: string;
  agentType: AgentType;
  sessionKey?: string;
  timestamp: number;
  /** Which rule was triggered */
  triggeredRule?: {
    severity: RuleSeverity;
    description: string;
    source?: string;
  };
  /** Enhanced context for better user understanding */
  context?: {
    commandStructure?: {
      binary?: string;
      subcommand?: string;
      flags?: Array<{ name: string; value?: string }>;
      arguments?: string[];
    };
    environment?: {
      git?: {
        isRepo: boolean;
        currentBranch: string;
        isMainBranch: boolean;
        hasUncommittedChanges: boolean;
        hasUnpushedCommits: boolean;
        isPrivateRepo: boolean;
      };
      project?: {
        type: 'node' | 'python' | 'go' | 'unknown';
        hasPackageFiles: boolean;
        isProduction: boolean;
        hasDatabaseConfig: boolean;
      };
      system?: {
        platform: string;
        hasRoot: boolean;
        networkConnected: boolean;
      };
    };
    riskAssessment?: {
      level: string;
      score: number;
      reasoning: string[];
      impact: {
        dataLoss: boolean;
        systemDamage: boolean;
        securityRisk: boolean;
        reversible: boolean;
      };
      confidence: number;
    };
    suggestions?: {
      alternatives?: string[];
      safetyChecks?: string[];
      mitigations?: string[];
    };
    detailedExplanation?: string;
  };
}

export interface ApprovalResolution {
  id: string;
  decision: Decision;
  resolvedAt: number;
}

// =========================================================================
// Match Result
// =========================================================================

export interface MatchResult {
  matched: boolean;
  severity?: RuleSeverity;
  description?: string;
  source?: string;
  /** AST-specific metadata (optional, used by AST rule engine) */
  metadata?: {
    riskLevel?: string;
    riskScore?: number;
    confidence?: number;
    triggeredRules?: string[];
    suggestions?: {
      alternatives?: string[];
      safetyChecks?: string[];
      mitigations?: string[];
    };
  };
}

// =========================================================================
// Socket Protocol
// =========================================================================

export type SocketMessage =
  | { type: "approval_request"; payload: ApprovalRequest }
  | { type: "approval_resolution"; payload: ApprovalResolution }
  | { type: "denied"; payload: { id: string; reason: string } };
