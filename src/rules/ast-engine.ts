/**
 * AST-based Semantic Engine — 纯语义解析引擎 (无风险评估)
 *
 * 只提供命令语义解析和上下文信息，让YAML规则系统做风险判断
 */

import { CommandParser } from '../ast/parser';
import { ContextAnalyzer } from '../ast/context';
import { ASTRuleEngine } from '../ast/rules';
import { MatchResult } from '../ast/types';
import { EngineConfig } from './engine';

export class ASTCommandEngine {
  private parser: CommandParser;
  private contextAnalyzer: ContextAnalyzer;
  private semanticEngine: ASTRuleEngine;

  constructor() {
    this.parser = new CommandParser();
    this.contextAnalyzer = new ContextAnalyzer();
    this.semanticEngine = new ASTRuleEngine();
  }

  /**
   * AST-based semantic parsing - 只解析语义，不评估风险
   */
  async matchCommand(
    command: string,
    cwd: string = process.cwd(),
    config: EngineConfig = { defaultMode: "allow" }
  ): Promise<MatchResult> {
    try {
      // Step 1: 解析命令为 AST
      const ast = this.parser.parse(command);

      // Step 2: 分析执行上下文
      const context = await this.contextAnalyzer.analyzeContext(cwd);

      // Step 3: 获取语义特征 (不做风险评估)
      const semanticResult = await this.semanticEngine.assessCommand(ast, context);

      // Step 4: 返回语义解析结果，让YAML规则决定风险
      return {
        matched: false, // 让YAML规则系统决定是否匹配
        metadata: {
          // 提供完整的语义信息供YAML规则使用
          ast: {
            binary: ast.binary,
            subcommand: ast.subcommand,
            flags: ast.flags.map(f => f.name),
            arguments: ast.arguments.map(a => a.value),
          },
          context: {
            cwd,
            git: context.git,
            project: context.project,
            system: context.system,
          },
          // 从新语义引擎获取的特征
          semanticFeatures: semanticResult.metadata?.semanticFeatures || {},
        }
      };

    } catch (error) {
      // 解析失败时返回基本信息
      console.warn(`AST parsing failed for command: ${command}`, error);

      return {
        matched: false,
        metadata: {
          parseError: error instanceof Error ? error.message : 'Unknown parsing error',
          command,
          cwd
        }
      };
    }
  }

  /**
   * 获取详细的语义解析报告（用于Monitor显示）
   */
  async getDetailedSemanticReport(command: string, cwd: string = process.cwd()) {
    try {
      const ast = this.parser.parse(command);
      const context = await this.contextAnalyzer.analyzeContext(cwd);
      const semanticResult = await this.semanticEngine.assessCommand(ast, context);

      return {
        command,
        ast: {
          binary: ast.binary,
          subcommand: ast.subcommand,
          flags: ast.flags.map(f => ({ name: f.name, value: f.value })),
          arguments: ast.arguments.map(a => a.value)
        },
        context: {
          git: context.git,
          project: context.project,
          system: context.system
        },
        semanticFeatures: semanticResult.metadata?.semanticFeatures || {},
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        command,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
}

/**
 * AST-based command matching function - 兼容现有接口
 */
export async function matchCommandAST(
  command: string,
  cwd: string = process.cwd(),
  config: EngineConfig = { defaultMode: "allow" }
): Promise<MatchResult> {
  const engine = new ASTCommandEngine();
  return engine.matchCommand(command, cwd, config);
}

// 导出单例实例供复用
export const astEngine = new ASTCommandEngine();