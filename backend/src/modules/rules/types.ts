/**
 * Aegis AST — Command Abstract Syntax Tree
 *
 * 解析命令结构，提供语义理解能力
 */

// =========================================================================
// Core AST Node Types
// =========================================================================

export interface BaseNode {
  type: string;
  raw: string;
  span: [number, number];
}

export interface CommandNode extends BaseNode {
  type: 'command';
  binary: string;
  subcommands: string[];
  flags: FlagNode[];
  arguments: ArgumentNode[];
  pipes?: PipeNode[];
  redirects?: RedirectNode[];
}

export interface FlagNode extends BaseNode {
  type: 'flag';
  name: string;
  short?: string;
  value?: string;
  hasValue: boolean;
}

export interface ArgumentNode extends BaseNode {
  type: 'argument';
  value: string;
  isGlob: boolean;
  isPath: boolean;
  isURL: boolean;
}

export interface PipeNode extends BaseNode {
  type: 'pipe';
  left: CommandNode;
  right: CommandNode;
}

export interface RedirectNode extends BaseNode {
  type: 'redirect';
  operator: '>' | '>>' | '<' | '2>' | '&>' | '2>&1';
  target: string;
}

// =========================================================================
// Context Information
// =========================================================================

export interface CommandContext {
  cwd: string;
  user?: string;
  shell: string;
  git?: {
    isRepo: boolean;
    currentBranch: string;
    isMainBranch: boolean;
    hasUncommittedChanges: boolean;
    hasUnpushedCommits: boolean;
    remoteUrl?: string;
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
}

// =========================================================================
// Rule Engine Types
// =========================================================================

export type RuleSeverity = 'off' | 'warn' | 'error' | 'block';
export type RuleAction = 'allow' | 'deny' | 'review' | 'block';

export interface MatchResult {
  matched: boolean;
  severity?: RuleSeverity;
  action?: RuleAction;
  description?: string;
  reason?: string;
  source?: string;
  metadata?: {
    riskLevel?: string;
    riskScore?: number;
    confidence?: number;
    triggeredRules?: string[];
    triggeredCount?: number;
    semanticFeatures?: any;
    [key: string]: any;
  };
}

export interface YAMLRule {
  id?: string;
  pattern?: string;
  description?: string;
  category?: string;
  severity?: RuleSeverity;
  action?: RuleAction;
  reason?: string;
  example?: string;
  _source?: 'built-in' | 'user' | 'project';
  conditions?: {
    binary?: string | string[];
    subcommand?: string | string[];
    hasFlags?: string[];
    forbiddenFlags?: string[];
    missingFlags?: string[];
    argumentPatterns?: string[];
    fullCommandPattern?: string;
    contextChecks?: {
      gitBranch?: string[];
      isProduction?: boolean;
      hasPermissions?: string[];
    };
  };
}

export interface YAMLRuleSet {
  name: string;
  version: string;
  rules: YAMLRule[];
}

export interface RuleEvaluation {
  action: RuleAction;
  reason: string;
  severity: RuleSeverity;
  riskScore: number;
  matchedRules: string[];
}

// =========================================================================
// Config Types (ESLint-style)
// =========================================================================

export interface AegisConfig {
  extends?: string[];
  rules?: Record<string, RuleSeverity | [RuleSeverity, any]>;
  settings?: {
    review_timeout?: number;
    strict_mode?: boolean;
    log_all_commands?: boolean;
  };
}

export interface ResolvedRuleSet {
  name: string;
  version: string;
  rules: Map<string, YAMLRule>;
  source: string;
}
