import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { YAMLRuleSet, YAMLRule, MatchResult, RuleAction, RuleSeverity, RuleEvaluation } from './types';
import { CommandNode, CommandContext } from './types';
import { hasFlag, getFlagValue, getArgumentValues } from './ast-parser.service';

interface ResolvedRuleSet {
  name: string;
  version: string;
  rules: Map<string, YAMLRule>;
  source: string;
}

interface AegisConfigFile {
  extends?: string[];
  rules?: Record<string, RuleSeverity>;
}

@Injectable()
export class RuleMatcherService {
  private readonly logger = new Logger(RuleMatcherService.name);
  private ruleSets: Map<string, ResolvedRuleSet> = new Map();
  private ruleIndex: Map<string, YAMLRule[]> = new Map();       // binary → rules
  private fullPatternRules: YAMLRule[] = [];                     // 含 fullCommandPattern 的规则
  private severityOverrides: Map<string, RuleSeverity> = new Map(); // config 覆盖

  constructor() {
    this.loadConfig();
    this.loadBuiltInRules();
    this.applyConfigOverrides();
  }

  // =========================================================================
  // ESLint-style Config 加载
  // =========================================================================

  private loadConfig(): void {
    const configPath = path.join(__dirname, '..', '..', 'rules', 'aegis.config.yaml');
    if (!fs.existsSync(configPath)) return;

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(raw) as AegisConfigFile;
      if (!config) return;

      // 解析 extends 链
      const merged: Record<string, RuleSeverity> = {};
      if (config.extends) {
        for (const ext of config.extends) {
          const extPath = path.join(__dirname, '..', '..', 'rules', `${ext}.yaml`);
          if (fs.existsSync(extPath)) {
            const extRaw = fs.readFileSync(extPath, 'utf8');
            const extConfig = yaml.load(extRaw) as AegisConfigFile;
            if (extConfig?.rules) Object.assign(merged, extConfig.rules);
          }
        }
      }

      // 当前 config 的 rules 覆盖 extends
      if (config.rules) Object.assign(merged, config.rules);

      for (const [id, sev] of Object.entries(merged)) {
        this.severityOverrides.set(id, sev as RuleSeverity);
      }

      this.logger.log(`Config loaded: ${this.severityOverrides.size} severity overrides`);
    } catch (e: any) {
      this.logger.warn(`Failed to load aegis.config.yaml: ${e.message}`);
    }
  }

  // =========================================================================
  // 规则加载
  // =========================================================================

  private loadBuiltInRules(): void {
    const rulesDir = path.join(__dirname, '..', '..', 'rules');
    if (!fs.existsSync(rulesDir)) {
      this.logger.warn(`Rules directory not found: ${rulesDir}`);
      return;
    }

    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of files) {
      // 跳过 config 文件
      if (file.startsWith('aegis.')) continue;
      try {
        const content = fs.readFileSync(path.join(rulesDir, file), 'utf8');
        const ruleSet = yaml.load(content) as YAMLRuleSet;
        if (ruleSet && ruleSet.name && Array.isArray(ruleSet.rules)) {
          this.registerRuleSet(file, ruleSet);
        } else {
          this.logger.warn(`Skipping ${file}: missing name or rules array`);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to load rule file ${file}: ${e.message}`);
      }
    }

    this.logger.log(`Loaded ${this.ruleSets.size} rule sets with ${this.countRules()} rules`);
  }

  private registerRuleSet(source: string, ruleSet: YAMLRuleSet): void {
    const setName = source.replace(/\.ya?ml$/, '');
    const resolved: ResolvedRuleSet = {
      name: setName,
      version: ruleSet.version || '1.0',
      rules: new Map(),
      source,
    };

    for (const rule of ruleSet.rules) {
      const id = rule.id || `${ruleSet.name}/${rule.category || 'default'}/${rule.description?.substring(0, 30) || 'unknown'}`;
      rule.id = id;
      resolved.rules.set(id, rule);

      // 索引：按 binary 分组
      const binaries = this.extractBinaries(rule);
      for (const binary of binaries) {
        if (!this.ruleIndex.has(binary)) {
          this.ruleIndex.set(binary, []);
        }
        this.ruleIndex.get(binary)!.push(rule);
      }

      // 索引：fullCommandPattern 规则（可能没有 binary 条件）
      if (rule.conditions?.fullCommandPattern && !rule.conditions?.binary) {
        this.fullPatternRules.push(rule);
      }
    }

    this.ruleSets.set(ruleSet.name, resolved);
  }

  private applyConfigOverrides(): void {
    for (const [id, severity] of this.severityOverrides) {
      let found = false;
      for (const rs of this.ruleSets.values()) {
        const rule = rs.rules.get(id);
        if (rule) {
          rule.severity = severity;
          found = true;
          break;
        }
      }
      if (!found) {
        this.logger.warn(`Config override for unknown rule: ${id}`);
      }
    }
  }

  private extractBinaries(rule: YAMLRule): string[] {
    const conditions = rule.conditions;
    if (!conditions?.binary) return ['*'];
    return Array.isArray(conditions.binary) ? conditions.binary : [conditions.binary];
  }

  private countRules(): number {
    let count = 0;
    for (const rs of this.ruleSets.values()) {
      count += rs.rules.size;
    }
    return count;
  }

  // =========================================================================
  // 规则匹配引擎
  // =========================================================================

  evaluate(ast: CommandNode, context: CommandContext): RuleEvaluation {
    const candidates = this.getCandidateRules(ast.binary);
    this.logger.debug(`Evaluating '${ast.binary}', ${candidates.length} candidate rules`);
    const results: MatchResult[] = [];

    for (const rule of candidates) {
      // 被 config 设为 off 的规则直接跳过
      if (rule.severity === 'off') continue;

      const match = this.matchRule(rule, ast, context);
      this.logger.debug(`Rule ${rule.id}: matched=${match.matched}`);
      if (match.matched) {
        results.push(match);
      }
    }

    return this.aggregateResults(results);
  }

  private getCandidateRules(binary: string): YAMLRule[] {
    const specific = this.ruleIndex.get(binary) || [];
    const wildcard = this.ruleIndex.get('*') || [];
    // 包含所有 fullCommandPattern-only 规则（没有 binary 条件，需每次遍历）
    return [...specific, ...wildcard, ...this.fullPatternRules];
  }

  private matchRule(rule: YAMLRule, ast: CommandNode, context: CommandContext): MatchResult {
    const conditions = rule.conditions;
    if (!conditions) {
      return { matched: false };
    }

    let matched = true;
    const triggered: string[] = [];

    // 1. Binary match
    if (conditions.binary) {
      const binaries = Array.isArray(conditions.binary) ? conditions.binary : [conditions.binary];
      if (!binaries.includes(ast.binary) && !binaries.includes('*')) {
        matched = false;
      } else {
        triggered.push(`binary:${ast.binary}`);
      }
    }

    // 2. Subcommand match — 匹配 subcommands 链中任一
    if (matched && conditions.subcommand) {
      const subs = Array.isArray(conditions.subcommand) ? conditions.subcommand : [conditions.subcommand];
      if (!ast.subcommands.some(s => subs.includes(s))) {
        matched = false;
      } else {
        triggered.push(`subcommand:${subs.join('|')}`);
      }
    }

    // 3. Flag checks
    if (matched && conditions.hasFlags) {
      const hasAnyFlag = conditions.hasFlags.some(flag => hasFlag(ast, flag));
      if (!hasAnyFlag) {
        matched = false;
      } else {
        triggered.push(`flags:${conditions.hasFlags.join('|')}`);
      }
    }

    if (matched && conditions.forbiddenFlags) {
      for (const flag of conditions.forbiddenFlags) {
        if (hasFlag(ast, flag)) {
          matched = false;
          triggered.push(`forbidden-flag:${flag}`);
          break;
        }
      }
    }

    // missingFlags: 指定的 flag 一个都不能出现
    if (matched && conditions.missingFlags) {
      for (const flag of conditions.missingFlags) {
        if (hasFlag(ast, flag)) {
          matched = false;
          triggered.push(`unexpected-flag:${flag}`);
          break;
        }
      }
    }

    // 4. Argument patterns (大小写不敏感；AND 逻辑：每条 pattern 至少匹配一个 arg 或 subcommand)
    if (matched && conditions.argumentPatterns) {
      const args = [...ast.subcommands, ...getArgumentValues(ast)];
      for (const pattern of conditions.argumentPatterns) {
        let regex: RegExp;
        try {
          regex = new RegExp(pattern, 'i');
        } catch (e: any) {
          this.logger.warn(`Invalid argumentPattern regex: ${pattern} — ${e.message}`);
          matched = false;
          break;
        }
        if (!args.some(arg => regex.test(arg))) {
          matched = false;
          break;
        }
        triggered.push(`arg-pattern:${pattern}`);
      }
    }

    // 5. Full command pattern (管道/重定向/fork-bomb 等无法拆解的模式)
    if (matched && conditions.fullCommandPattern) {
      try {
        const regex = new RegExp(conditions.fullCommandPattern);
        if (!regex.test(ast.raw)) {
          matched = false;
        } else {
          triggered.push(`full-pattern:${conditions.fullCommandPattern.substring(0, 40)}`);
        }
      } catch (e: any) {
        this.logger.warn(`Invalid fullCommandPattern: ${conditions.fullCommandPattern} — ${e.message}`);
        matched = false;
      }
    }

    // 6. Context checks
    if (matched && conditions.contextChecks) {
      const ctx = conditions.contextChecks;
      if (ctx.gitBranch && context.git) {
        if (!ctx.gitBranch.includes(context.git.currentBranch)) {
          matched = false;
        } else {
          triggered.push(`git-branch:${context.git.currentBranch}`);
        }
      }
      if (ctx.isProduction !== undefined && context.project) {
        if (context.project.isProduction !== ctx.isProduction) {
          matched = false;
        } else {
          triggered.push(`production:${ctx.isProduction}`);
        }
      }
    }

    if (!matched) {
      return { matched: false };
    }

    const triggeredCount = triggered.length;

    return {
      matched: true,
      severity: rule.severity || 'warn',
      action: rule.action || 'review',
      description: rule.description,
      reason: rule.reason,
      source: rule.id,
      metadata: {
        triggeredRules: triggered,
        triggeredCount,
        riskLevel: this.severityToRiskLevel(rule.severity),
      },
    };
  }

  // =========================================================================
  // 结果聚合 — 确定性优先级
  // =========================================================================

  private aggregateResults(results: MatchResult[]): RuleEvaluation {
    if (results.length === 0) {
      return {
        action: 'allow',
        reason: 'No rules matched',
        severity: 'off',
        riskScore: 0,
        matchedRules: [],
      };
    }

    // 排序：action 优先级 → severity 优先级 → 触发条件数量多(更具体) → id 字典序
    const actionPriority: Record<string, number> = { block: 4, deny: 3, review: 2, allow: 1 };
    const severityPriority: Record<string, number> = { block: 4, error: 3, warn: 2, off: 0 };

    results.sort((a, b) => {
      // 1. action 优先级：block > deny > review > allow
      const pa = actionPriority[a.action || 'allow'] || 0;
      const pb = actionPriority[b.action || 'allow'] || 0;
      if (pa !== pb) return pb - pa;

      // 2. severity 优先级：block > error > warn
      const sa = severityPriority[a.severity || 'off'] || 0;
      const sb = severityPriority[b.severity || 'off'] || 0;
      if (sa !== sb) return sb - sa;

      // 3. 触发条件越多越具体，优先
      const ta = a.metadata?.triggeredCount ?? 0;
      const tb = b.metadata?.triggeredCount ?? 0;
      if (ta !== tb) return tb - ta;

      // 4. 字典序兜底，保证确定性
      return (a.source || '').localeCompare(b.source || '');
    });

    const top = results[0];
    const riskScore = this.calculateRiskScore(results);

    return {
      action: top.action || 'allow',
      reason: top.reason || top.description || 'Rule matched',
      severity: top.severity || 'warn',
      riskScore,
      matchedRules: results.map(r => r.source!).filter(Boolean),
    };
  }

  private calculateRiskScore(results: MatchResult[]): number {
    const severityScores: Record<string, number> = { off: 0, warn: 30, error: 70, block: 100 };
    let maxScore = 0;
    for (const r of results) {
      const s = severityScores[r.severity || 'off'] || 0;
      if (s > maxScore) maxScore = s;
    }
    return maxScore;
  }

  private severityToRiskLevel(severity?: RuleSeverity): string {
    const map: Record<string, string> = {
      off: 'none',
      warn: 'low',
      error: 'high',
      block: 'critical',
    };
    return map[severity || 'off'] || 'unknown';
  }

  // =========================================================================
  // 规则管理 API
  // =========================================================================

  getAllRules(): YAMLRule[] {
    const all: YAMLRule[] = [];
    for (const rs of this.ruleSets.values()) {
      all.push(...Array.from(rs.rules.values()));
    }
    return all;
  }

  getRuleSet(name: string): ResolvedRuleSet | undefined {
    return this.ruleSets.get(name);
  }

  reloadRules(): void {
    this.ruleSets.clear();
    this.ruleIndex.clear();
    this.fullPatternRules = [];
    this.severityOverrides.clear();
    this.loadConfig();
    this.loadBuiltInRules();
    this.applyConfigOverrides();
  }
}
