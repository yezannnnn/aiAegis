/**
 * Aegis AST Semantic Engine — 纯语义解析引擎 (无风险评估)
 *
 * 只负责解析命令结构和提供上下文，风险判断交给YAML规则系统
 */

import { CommandNode, CommandContext, MatchResult } from './types';
import { hasFlag, hasArgument, getArgumentValues } from './parser';

/**
 * 语义解析引擎 - 不做风险评估，只提供解析结果
 */
export class ASTSemanticEngine {

  /**
   * 解析命令并返回语义信息 - 替代风险评估
   */
  async parseCommand(ast: CommandNode, context: CommandContext): Promise<MatchResult> {
    // 不做风险评估，返回解析结果供YAML规则使用
    return {
      matched: false, // 让YAML规则系统决定是否匹配
      // 提供语义解析信息供YAML规则系统使用
      metadata: {
        ast,
        context,
        // 提供常用的语义检测结果
        semanticFeatures: this.extractSemanticFeatures(ast, context)
      }
    };
  }

  /**
   * 提取语义特征 - 供YAML规则系统使用
   */
  private extractSemanticFeatures(ast: CommandNode, context: CommandContext) {
    const features: any = {
      // 基本命令结构
      binary: ast.binary,
      subcommand: ast.subcommand,
      flags: ast.flags.map(f => f.name),
      arguments: getArgumentValues(ast),

      // Git 语义特征
      git: {
        isForceOperation: hasFlag(ast, 'force') || hasFlag(ast, 'f'),
        isHardReset: ast.binary === 'git' && ast.subcommand === 'reset' && hasFlag(ast, 'hard'),
        targetBranch: this.extractGitTargetBranch(ast, context),
        isMainBranch: context.git?.isMainBranch || false,
        hasUncommittedChanges: context.git?.hasUncommittedChanges || false,
        hasUnpushedCommits: context.git?.hasUnpushedCommits || false,
      },

      // 文件系统语义特征
      filesystem: {
        isRecursiveDelete: ast.binary === 'rm' && (hasFlag(ast, 'r') || hasFlag(ast, 'R')),
        isForceDelete: ast.binary === 'rm' && hasFlag(ast, 'f'),
        isRecursiveForce: ast.binary === 'rm' && hasFlag(ast, 'r') && hasFlag(ast, 'f'),
        targetPaths: ast.binary === 'rm' ? getArgumentValues(ast) : [],
        hasDangerousPath: this.checkDangerousPaths(getArgumentValues(ast)),
      },

      // 数据库语义特征
      database: {
        isMySQL: ['mysql', 'mysqldump'].includes(ast.binary),
        hasDestructiveKeywords: this.checkDestructiveSQL(ast.raw),
        isProduction: context.project?.isProduction || false,
        hasDatabaseConfig: context.project?.hasDatabaseConfig || false,
      },

      // 系统上下文特征
      system: {
        hasRootPrivileges: context.system?.hasRoot || false,
        platform: context.system?.platform,
        projectType: context.project?.type,
        currentWorkingDirectory: context.cwd,
      }
    };

    return features;
  }

  /**
   * 提取 Git 目标分支
   */
  private extractGitTargetBranch(ast: CommandNode, context: CommandContext): string | null {
    if (ast.binary !== 'git') return null;

    const args = getArgumentValues(ast);
    if (ast.subcommand === 'push' && args.length >= 2) {
      return args[1]; // git push origin <branch>
    }

    return context.git?.currentBranch || null;
  }

  /**
   * 检查危险路径
   */
  private checkDangerousPaths(paths: string[]): boolean {
    const dangerousPatterns = [
      '/', '/*', '~', '$HOME',
      '/usr', '/etc', '/var', '/bin', '/sbin', '/boot', '/lib',
      '.', './*'
    ];

    return paths.some(path =>
      dangerousPatterns.some(pattern =>
        path === pattern || path.includes(pattern)
      )
    );
  }

  /**
   * 检查破坏性 SQL 关键词
   */
  private checkDestructiveSQL(command: string): boolean {
    const destructivePatterns = [
      'drop database',
      'drop table',
      'truncate table',
      'delete from',
      'update.*set.*where.*1.*=.*1'
    ];

    const lowerCommand = command.toLowerCase();
    return destructivePatterns.some(pattern =>
      new RegExp(pattern).test(lowerCommand)
    );
  }
}

/**
 * 向后兼容的规则引擎 - 桥接到语义引擎
 */
export class ASTRuleEngine {
  private semanticEngine: ASTSemanticEngine;

  constructor() {
    this.semanticEngine = new ASTSemanticEngine();
  }

  /**
   * 兼容旧接口 - 但不做风险评估
   */
  async assessCommand(ast: CommandNode, context: CommandContext): Promise<MatchResult> {
    // 调用纯语义解析，不做风险评估
    return await this.semanticEngine.parseCommand(ast, context);
  }
}