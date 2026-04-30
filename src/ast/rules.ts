/**
 * Aegis AST Rules Engine — 基于语义的风险规则
 *
 * 用AST语义分析替代正则匹配，大幅提升准确性
 */

import { CommandNode, CommandContext, ASTRule, RiskAssessment, RiskLevel } from './types';
import { hasFlag, hasArgument, getArgumentValues } from './parser';

/**
 * Git 相关的 AST 规则
 */
export const gitASTRules: ASTRule[] = [
  // 危险的 Git Force Push
  {
    id: 'git-force-push',
    description: 'Git force push operation',
    category: 'git',
    conditions: {
      binary: 'git',
      subcommand: 'push',
      hasFlags: ['force', 'f'],
    },
    assessRisk: (ast: CommandNode, context: CommandContext): RiskAssessment => {
      const args = getArgumentValues(ast);
      const targetBranch = args[1] || context.git?.currentBranch || 'unknown';

      let level: RiskLevel = 'MEDIUM';
      let score = 60;
      const reasoning: string[] = ['检测到 git force push 操作'];

      // 主分支强推 - 极高风险
      if (['main', 'master', 'develop', 'production'].includes(targetBranch)) {
        level = 'CRITICAL';
        score = 95;
        reasoning.push(`目标分支 '${targetBranch}' 是主分支`);
      }

      // 有远程更改但要强推 - 高风险
      if (context.git?.hasUnpushedCommits) {
        level = level === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
        score = Math.max(score, 80);
        reasoning.push('本地有未推送提交，可能覆盖远程更改');
      }

      // 个人特性分支 - 降低风险
      if (targetBranch.includes('feature/') || targetBranch.includes('hotfix/')) {
        score = Math.max(30, score - 30);
        level = score < 50 ? 'LOW' : level;
        reasoning.push('目标是个人特性分支，风险相对较低');
      }

      // 使用 --force-with-lease - 降低风险
      if (hasFlag(ast, 'force-with-lease')) {
        score = Math.max(20, score - 25);
        reasoning.push('使用 --force-with-lease，风险有所降低');
      }

      return {
        level,
        score,
        reasoning,
        impact: {
          dataLoss: true,
          systemDamage: false,
          securityRisk: false,
          reversible: false,
        },
        suggestions: {
          alternatives: [
            'git push --force-with-lease',
            'git pull --rebase && git push',
            'git push origin +HEAD:refs/heads/backup-branch', // 先备份
          ],
          safetyChecks: [
            '确认目标分支是否正确',
            '检查是否有其他人在同一分支工作',
            '确认本地更改已经过充分测试',
          ],
          mitigations: [
            'git stash push -m "pre-force-push"',
            'git log origin/' + targetBranch + '..HEAD',
          ],
        },
        triggeredRules: ['git-force-push'],
        confidence: 0.9,
      };
    },
  },

  // 危险的 Git Reset
  {
    id: 'git-reset-hard',
    description: 'Git hard reset operation',
    category: 'git',
    conditions: {
      binary: 'git',
      subcommand: 'reset',
      hasFlags: ['hard'],
    },
    assessRisk: (ast: CommandNode, context: CommandContext): RiskAssessment => {
      let level: RiskLevel = 'HIGH';
      let score = 75;
      const reasoning: string[] = ['检测到 git reset --hard 操作'];

      // 有未提交更改 - 极高风险
      if (context.git?.hasUncommittedChanges) {
        level = 'CRITICAL';
        score = 90;
        reasoning.push('存在未提交更改，将永久丢失');
      }

      // 重置到远程分支相对安全
      const args = getArgumentValues(ast);
      if (args.length > 0 && args[0].startsWith('origin/')) {
        score = Math.max(40, score - 30);
        reasoning.push('重置到远程分支，相对安全');
      }

      return {
        level,
        score,
        reasoning,
        impact: {
          dataLoss: true,
          systemDamage: false,
          securityRisk: false,
          reversible: false,
        },
        suggestions: {
          alternatives: [
            'git stash',
            'git checkout -- .',
            'git clean -fd',
          ],
          safetyChecks: [
            '确认所有重要更改已保存',
            '检查是否有需要保留的未跟踪文件',
          ],
          mitigations: [
            'git stash push -m "before-reset"',
            'git reflog', // 可恢复的最后手段
          ],
        },
        triggeredRules: ['git-reset-hard'],
        confidence: 0.95,
      };
    },
  },
];

/**
 * 数据库相关的 AST 规则
 */
export const databaseASTRules: ASTRule[] = [
  // 危险的 MySQL 操作
  {
    id: 'mysql-destructive',
    description: 'MySQL destructive operations',
    category: 'database',
    conditions: {
      binary: ['mysql', 'mysqldump'],
    },
    assessRisk: (ast: CommandNode, context: CommandContext): RiskAssessment => {
      const commandStr = ast.raw.toLowerCase();
      let level: RiskLevel = 'LOW';
      let score = 20;
      const reasoning: string[] = ['检测到 MySQL 数据库操作'];

      // 检测破坏性关键词
      const destructivePatterns = [
        'drop database',
        'drop table',
        'truncate table',
        'delete from',
        'update.*set.*where.*1.*=.*1', // 无条件更新
      ];

      for (const pattern of destructivePatterns) {
        if (new RegExp(pattern).test(commandStr)) {
          if (pattern.includes('drop database') || pattern.includes('truncate')) {
            level = 'CRITICAL';
            score = 95;
            reasoning.push(`检测到极危险操作: ${pattern}`);
          } else {
            level = 'HIGH';
            score = 80;
            reasoning.push(`检测到高风险操作: ${pattern}`);
          }
          break;
        }
      }

      // 生产环境加重风险
      if (context.project?.isProduction) {
        score = Math.min(100, score + 20);
        level = score > 80 ? 'CRITICAL' : level;
        reasoning.push('当前环境被识别为生产环境');
      }

      // 有数据库配置文件
      if (context.project?.hasDatabaseConfig) {
        score = Math.min(100, score + 10);
        reasoning.push('检测到数据库配置文件');
      }

      return {
        level,
        score,
        reasoning,
        impact: {
          dataLoss: true,
          systemDamage: false,
          securityRisk: true,
          reversible: false,
        },
        suggestions: {
          alternatives: [
            '先备份: mysqldump database > backup.sql',
            '使用事务: START TRANSACTION; ... COMMIT;',
            '限制条件: 添加 LIMIT 子句',
          ],
          safetyChecks: [
            '确认数据库备份存在且完整',
            '在开发环境先测试 SQL 语句',
            '检查受影响的记录数量',
          ],
          mitigations: [
            'mysqldump database > pre-operation-backup.sql',
            'SHOW PROCESSLIST; -- 检查活动连接',
          ],
        },
        triggeredRules: ['mysql-destructive'],
        confidence: 0.9,
      };
    },
  },
];

/**
 * 文件系统相关的 AST 规则
 */
export const filesystemASTRules: ASTRule[] = [
  // 危险的 rm -rf
  {
    id: 'rm-recursive-force',
    description: 'Recursive force delete operation',
    category: 'filesystem',
    conditions: {
      binary: 'rm',
      hasFlags: ['r', 'f'],
    },
    assessRisk: (ast: CommandNode, context: CommandContext): RiskAssessment => {
      const args = getArgumentValues(ast);
      let level: RiskLevel = 'HIGH';
      let score = 75;
      const reasoning: string[] = ['检测到 rm -rf 递归强制删除'];

      // 检查目标路径危险性
      for (const arg of args) {
        if (arg === '/' || arg === '/*' || arg === '~' || arg === '$HOME') {
          level = 'CRITICAL';
          score = 100;
          reasoning.push(`极度危险的删除目标: ${arg}`);
        } else if (arg.includes('/usr') || arg.includes('/etc') || arg.includes('/var')) {
          level = 'CRITICAL';
          score = 95;
          reasoning.push(`删除系统目录: ${arg}`);
        } else if (arg === '.' || arg === './*') {
          level = 'HIGH';
          score = 85;
          reasoning.push('删除当前目录所有内容');
        } else if (arg.includes('node_modules') || arg.includes('.git')) {
          level = 'MEDIUM';
          score = 50;
          reasoning.push(`删除项目依赖/版本控制目录: ${arg}`);
        }
      }

      // Root 权限加重风险
      if (context.system?.hasRoot) {
        score = Math.min(100, score + 15);
        level = score > 90 ? 'CRITICAL' : level;
        reasoning.push('以 root 权限执行删除操作');
      }

      return {
        level,
        score,
        reasoning,
        impact: {
          dataLoss: true,
          systemDamage: level === 'CRITICAL',
          securityRisk: false,
          reversible: false,
        },
        suggestions: {
          alternatives: [
            'trash <file>  # 使用垃圾箱',
            'mv <file> /tmp/backup_$(date +%s)',
            'ls -la <target>  # 先查看内容',
          ],
          safetyChecks: [
            '仔细检查删除目标路径',
            '确认没有重要文件',
            '考虑是否有备份',
          ],
          mitigations: [
            'tar -czf backup.tar.gz <target>',
            'find <target> -type f | head -20  # 预览文件',
          ],
        },
        triggeredRules: ['rm-recursive-force'],
        confidence: 0.95,
      };
    },
  },
];

/**
 * 主规则引擎
 */
export class ASTRuleEngine {
  private rules: ASTRule[] = [
    ...gitASTRules,
    ...databaseASTRules,
    ...filesystemASTRules,
  ];

  /**
   * 评估命令风险
   */
  async assessCommand(ast: CommandNode, context: CommandContext): Promise<RiskAssessment> {
    // 找到匹配的规则
    const matchedRules = this.findMatchingRules(ast);

    if (matchedRules.length === 0) {
      return this.createSafeAssessment();
    }

    // 评估每个规则的风险
    const assessments = matchedRules.map(rule => rule.assessRisk(ast, context));

    // 选择最高风险的评估结果
    const highestRisk = assessments.reduce((prev, curr) =>
      curr.score > prev.score ? curr : prev
    );

    // 应用上下文风险乘数 (从 context.ts 的分析结果)
    return this.applyContextMultiplier(highestRisk, context);
  }

  /**
   * 找到匹配的规则
   */
  private findMatchingRules(ast: CommandNode): ASTRule[] {
    return this.rules.filter(rule => {
      const conditions = rule.conditions;

      // 检查 binary 匹配
      if (conditions.binary) {
        const binaries = Array.isArray(conditions.binary) ? conditions.binary : [conditions.binary];
        if (!binaries.includes(ast.binary)) {
          return false;
        }
      }

      // 检查 subcommand 匹配
      if (conditions.subcommand) {
        const subcommands = Array.isArray(conditions.subcommand) ? conditions.subcommand : [conditions.subcommand];
        if (!ast.subcommand || !subcommands.includes(ast.subcommand)) {
          return false;
        }
      }

      // 检查必需 flags
      if (conditions.hasFlags) {
        if (!conditions.hasFlags.some(flag => hasFlag(ast, flag))) {
          return false;
        }
      }

      // 检查禁止的 flags
      if (conditions.forbiddenFlags) {
        if (conditions.forbiddenFlags.some(flag => hasFlag(ast, flag))) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 创建安全评估结果
   */
  private createSafeAssessment(): RiskAssessment {
    return {
      level: 'SAFE',
      score: 0,
      reasoning: ['命令未触发任何风险规则'],
      impact: {
        dataLoss: false,
        systemDamage: false,
        securityRisk: false,
        reversible: true,
      },
      suggestions: {
        alternatives: [],
        safetyChecks: [],
        mitigations: [],
      },
      triggeredRules: [],
      confidence: 0.8,
    };
  }

  /**
   * 应用上下文风险乘数
   */
  private applyContextMultiplier(assessment: RiskAssessment, context: CommandContext): RiskAssessment {
    // 简化的上下文乘数逻辑
    let multiplier = 1.0;

    if (context.project?.isProduction) multiplier *= 1.5;
    if (context.git?.isMainBranch) multiplier *= 1.3;
    if (context.system?.hasRoot) multiplier *= 1.2;

    const newScore = Math.min(100, Math.round(assessment.score * multiplier));
    const newLevel = this.scoreToLevel(newScore);

    return {
      ...assessment,
      score: newScore,
      level: newLevel,
    };
  }

  /**
   * 分数转风险级别
   */
  private scoreToLevel(score: number): RiskLevel {
    if (score >= 90) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'SAFE';
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: ASTRule): void {
    this.rules.push(rule);
  }

  /**
   * 获取所有规则
   */
  getRules(): ASTRule[] {
    return [...this.rules];
  }
}