/**
 * Aegis AST — Command Abstract Syntax Tree
 *
 * 解析命令结构，提供语义理解能力，替代正则匹配
 */

// =========================================================================
// Core AST Node Types
// =========================================================================

export interface BaseNode {
  type: string;
  raw: string;        // 原始文本
  span: [number, number]; // 在原始命令中的位置
}

export interface CommandNode extends BaseNode {
  type: 'command';
  binary: string;           // 主命令 "git", "mysql", "rm"
  subcommand?: string;      // 子命令 "push", "commit"
  flags: FlagNode[];        // 选项 "--force", "-v"
  arguments: ArgumentNode[]; // 参数 "origin", "main"
  pipes?: PipeNode[];       // 管道操作
  redirects?: RedirectNode[]; // 重定向
}

export interface FlagNode extends BaseNode {
  type: 'flag';
  name: string;       // "force", "verbose"
  short?: string;     // "f", "v"
  value?: string;     // 对于 --output=file
  hasValue: boolean;
}

export interface ArgumentNode extends BaseNode {
  type: 'argument';
  value: string;
  isGlob: boolean;    // 是否包含 * ? 等通配符
  isPath: boolean;    // 是否是文件路径
  isURL: boolean;     // 是否是URL
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
  // 执行环境
  cwd: string;
  user?: string;
  shell: string;

  // Git上下文 (如果适用)
  git?: {
    isRepo: boolean;
    currentBranch: string;
    isMainBranch: boolean;
    hasUncommittedChanges: boolean;
    hasUnpushedCommits: boolean;
    remoteUrl?: string;
    isPrivateRepo: boolean;
  };

  // 项目上下文
  project?: {
    type: 'node' | 'python' | 'go' | 'unknown';
    hasPackageFiles: boolean;
    isProduction: boolean;
    hasDatabaseConfig: boolean;
  };

  // 系统上下文
  system?: {
    platform: string;
    hasRoot: boolean;
    networkConnected: boolean;
  };
}

// =========================================================================
// Risk Analysis Results
// =========================================================================

export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;        // 0-100
  reasoning: string[];  // 风险原因列表

  // 影响分析
  impact: {
    dataLoss: boolean;
    systemDamage: boolean;
    securityRisk: boolean;
    reversible: boolean;
  };

  // 建议
  suggestions: {
    alternatives: string[];    // 替代命令
    safetyChecks: string[];   // 执行前检查项
    mitigations: string[];    // 风险缓解措施
  };

  // 元信息
  triggeredRules: string[];
  confidence: number;   // 评估置信度
}

// =========================================================================
// Rule Definition (AST-based)
// =========================================================================

export interface ASTRule {
  id: string;
  description: string;
  category: string;

  // 匹配条件 (语义化)
  conditions: {
    binary?: string | string[];
    subcommand?: string | string[];
    hasFlags?: string[];         // 必须包含的flag
    forbiddenFlags?: string[];   // 禁止的flag组合
    argumentPatterns?: string[]; // 参数模式

    // 上下文条件
    contextChecks?: {
      gitBranch?: string[];
      isProduction?: boolean;
      hasPermissions?: string[];
    };
  };

  // 风险评估函数
  assessRisk: (ast: CommandNode, context: CommandContext) => RiskAssessment;
}