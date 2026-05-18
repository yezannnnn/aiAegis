import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as shellQuote from 'shell-quote';
import { YAMLRuleSet, YAMLRule, MatchResult, RuleAction, RuleSeverity, RuleEvaluation } from './types';
import { CommandNode, CommandContext, CommandSignature, Flag, Selector } from './types';
import { hasFlag, getFlagValue, getArgumentValues } from './ast-parser.service';
import { BashAstService } from './bash-ast.service';
import { resolveReason } from './utils/reason-resolver';

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

  // user rules: ~/.aegis/rules/
  private readonly userRulesDir = path.join(os.homedir(), '.aegis', 'rules');
  // project rules cache: cwd → Map<ruleId, YAMLRule>
  private projectRulesCache: Map<string, Map<string, YAMLRule>> = new Map();

  constructor(private readonly bashAst: BashAstService) {
    this.loadConfig();
    this.loadBuiltInRules();
    this.loadUserRules();
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
      if (file.startsWith('aegis.')) continue;
      try {
        const content = fs.readFileSync(path.join(rulesDir, file), 'utf8');
        const ruleSet = yaml.load(content) as YAMLRuleSet;
        if (ruleSet && ruleSet.name && Array.isArray(ruleSet.rules)) {
          this.registerRuleSet(file, ruleSet, 'built-in');
        } else {
          this.logger.warn(`Skipping ${file}: missing name or rules array`);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to load rule file ${file}: ${e.message}`);
      }
    }

    this.logger.log(`Loaded ${this.ruleSets.size} rule sets with ${this.countRules()} built-in rules`);
  }

  // -------------------------------------------------------------------------
  // 用户规则 (~/.aegis/rules/)
  // -------------------------------------------------------------------------

  private loadUserRules(): void {
    if (!fs.existsSync(this.userRulesDir)) return;

    const files = fs.readdirSync(this.userRulesDir)
      .filter(f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('example'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.userRulesDir, file), 'utf8');
        const ruleSet = yaml.load(content) as YAMLRuleSet;
        if (ruleSet && ruleSet.name && Array.isArray(ruleSet.rules)) {
          this.registerRuleSet(`user:${file}`, ruleSet, 'user');
        }
      } catch (e: any) {
        this.logger.warn(`Failed to load user rule ${file}: ${e.message}`);
      }
    }

    this.logger.log(`User rules dir: ${this.userRulesDir}`);
  }

  // -------------------------------------------------------------------------
  // 项目规则 (<cwd>/.aegis/rules/) — 按请求动态加载，结果缓存
  // -------------------------------------------------------------------------

  private getProjectRules(cwd: string): Map<string, YAMLRule> {
    if (this.projectRulesCache.has(cwd)) {
      return this.projectRulesCache.get(cwd)!;
    }

    const projectRulesDir = path.join(cwd, '.aegis', 'rules');
    const merged = new Map<string, YAMLRule>();

    if (!fs.existsSync(projectRulesDir)) {
      this.projectRulesCache.set(cwd, merged);
      return merged;
    }

    const files = fs.readdirSync(projectRulesDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(projectRulesDir, file), 'utf8');
        const ruleSet = yaml.load(content) as YAMLRuleSet;
        if (ruleSet?.rules && Array.isArray(ruleSet.rules)) {
          for (const rule of ruleSet.rules) {
            if (rule.id) {
              rule._source = 'project';
              merged.set(rule.id, rule);
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to load project rule ${file}: ${e.message}`);
      }
    }

    this.logger.log(`Project rules from ${projectRulesDir}: ${merged.size} rules`);
    this.projectRulesCache.set(cwd, merged);
    return merged;
  }

  private registerRuleSet(source: string, ruleSet: YAMLRuleSet, ruleSource: 'built-in' | 'user' | 'project' = 'built-in'): void {
    const setName = source.replace(/^(user:|project:)?/, '').replace(/\.ya?ml$/, '');
    const storageKey = `${ruleSource}:${setName}`;

    const resolved: ResolvedRuleSet = {
      name: storageKey,
      version: ruleSet.version || '1.0',
      rules: new Map(),
      source,
    };

    for (const rule of ruleSet.rules) {
      const id = rule.id || `${ruleSet.name}/${rule.category || 'default'}/${rule.description?.substring(0, 30) || 'unknown'}`;
      rule.id = id;
      rule._source = ruleSource;
      if (!rule.example) {
        rule.example = this.buildExampleCommand(rule);
      }

      // Pre-compile argument pattern regexes at load time
      if (rule.selector?.arguments) {
        for (const argSel of rule.selector.arguments) {
          try {
            argSel._regex = new RegExp(argSel.pattern, 'i');
          } catch (e: any) {
            this.logger.warn(`Rule ${id}: invalid argument pattern '${argSel.pattern}': ${e.message}`);
          }
        }
      }

      // 用户/项目规则覆盖内置规则：从 ruleIndex 中移除旧条目
      if (ruleSource !== 'built-in') {
        for (const [binary, rules] of this.ruleIndex) {
          const idx = rules.findIndex(r => r.id === id);
          if (idx !== -1) rules.splice(idx, 1);
        }
        // 同时从 fullPatternRules 中移除
        const fpIdx = this.fullPatternRules.findIndex(r => r.id === id);
        if (fpIdx !== -1) this.fullPatternRules.splice(fpIdx, 1);
      }

      resolved.rules.set(id, rule);

      // 索引：按 binary 分组
      const binaries = this.extractBinaries(rule);
      for (const binary of binaries) {
        if (!this.ruleIndex.has(binary)) {
          this.ruleIndex.set(binary, []);
        }
        this.ruleIndex.get(binary)!.push(rule);
      }

      // 索引：fullCommandPattern 规则
      if (rule.conditions?.fullCommandPattern && !rule.conditions?.binary) {
        this.fullPatternRules.push(rule);
      }
    }

    this.ruleSets.set(storageKey, resolved);
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

  // =========================================================================
  // 示例命令生成（从 conditions 自动拼出可读命令）
  // =========================================================================

  private buildExampleCommand(rule: YAMLRule): string {
    const c = rule.conditions;
    if (!c) return '';

    const parts: string[] = [];

    // binary
    if (c.binary) {
      const bin = Array.isArray(c.binary) ? c.binary[0] : c.binary;
      parts.push(bin);
    }

    // argumentPatterns → 提取字面量
    if (c.argumentPatterns) {
      for (const pat of c.argumentPatterns) {
        const lit = this.patternToLiteral(pat);
        if (lit) parts.push(lit);
      }
    }

    // subcommand
    if (c.subcommand) {
      const sub = Array.isArray(c.subcommand) ? c.subcommand[0] : c.subcommand;
      const lit = this.patternToLiteral(sub);
      if (lit && !parts.includes(lit)) parts.push(lit);
    }

    // hasFlags — 长 flag 用 --, 短 flag 合并为 -xyz
    if (c.hasFlags && c.hasFlags.length > 0) {
      const long = c.hasFlags.filter(f => f.length > 1);
      const short = c.hasFlags.filter(f => f.length === 1);
      if (long.length > 0) {
        parts.push(...long.map(f => `--${f}`));
      } else if (short.length > 0) {
        parts.push(`-${short.join('')}`);
      }
    }

    if (parts.length === 0) return '';
    return `例: ${parts.join(' ')}`;
  }

  private patternToLiteral(pattern: string): string {
    return pattern
      .replace(/^\^/, '')
      .replace(/\$$/, '')
      .replace(/\(([^)]+)\)/g, (_, g: string) => g.split('|')[0])
      .replace(/[\\.*+?[\]{}|]/g, '')
      .trim();
  }

  private extractBinaries(rule: YAMLRule): string[] {
    if (rule.selector?.binary) {
      return Array.isArray(rule.selector.binary) ? rule.selector.binary : [rule.selector.binary];
    }
    if (rule.conditions?.binary) {
      return Array.isArray(rule.conditions.binary) ? rule.conditions.binary : [rule.conditions.binary];
    }
    return ['*'];
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

  evaluate(ast: CommandNode, context: CommandContext, cwd?: string, lang: string = 'en'): RuleEvaluation {
    let candidates = this.getCandidateRules(ast.binary);

    if (cwd) {
      const projectRules = this.getProjectRules(cwd);
      if (projectRules.size > 0) {
        candidates = candidates.filter(r => !r.id || !projectRules.has(r.id));
        for (const rule of projectRules.values()) {
          const binaries = this.extractBinaries(rule);
          if (binaries.includes(ast.binary) || binaries.includes('*')) {
            candidates.push(rule);
          }
          if ((rule.conditions?.fullCommandPattern && !rule.conditions?.binary) ||
              (rule.selector && !rule.selector.binary)) {
            candidates.push(rule);
          }
        }
      }
    }

    this.logger.debug(`Evaluating '${ast.binary}', ${candidates.length} candidate rules`);
    const results: MatchResult[] = [];

    // Lazy pipeline signatures via BashAstService (unbash + fallback)
    let pipelineSignatures: CommandSignature[] | undefined;
    const getSignatures = (): CommandSignature[] => {
      if (!pipelineSignatures) {
        pipelineSignatures = this.bashAst.parse(ast.raw);
        if (pipelineSignatures.length === 0) {
          // Empty result shouldn't happen, but guard
          pipelineSignatures = [{ binary: ast.binary, positionalArgs: [], flags: [], raw: ast.raw, hasPipes: false, hasRedirects: false, hasLogicalOperators: false }];
        }
      }
      return pipelineSignatures;
    };

    for (const rule of candidates) {
      if (rule.severity === 'off') continue;

      const match = rule.selector
        ? this.matchRuleSelector(rule, getSignatures(), ast.raw, context)
        : this.matchRule(rule, ast, context);

      this.logger.debug(`Rule ${rule.id}: matched=${match.matched}`);
      if (match.matched) {
        results.push(match);
      }
    }

    return this.aggregateResults(results, lang);
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
        const regex = new RegExp(conditions.fullCommandPattern, 'i');
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
  // Pipeline 分割 & Signature 构建
  // =========================================================================

  /** Split a raw command on unquoted | (not ||) into segments. */
  private splitPipelineSegments(raw: string): string[] {
    const segments: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        current += ch;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        current += ch;
      } else if (ch === '|' && !inSingle && !inDouble) {
        // Skip || (logical OR)
        if (raw[i + 1] === '|' || (i > 0 && raw[i - 1] === '|')) {
          current += ch;
        } else {
          segments.push(current.trim());
          current = '';
        }
      } else {
        current += ch;
      }
    }

    if (current.trim()) segments.push(current.trim());
    return segments.length > 0 ? segments : [raw.trim()];
  }

  /** Convert a single command string into a CommandSignature. */
  private segmentToSignature(segment: string, hasPipes: boolean): CommandSignature {
    let tokens: any[];
    try {
      tokens = (shellQuote as any).parse(segment) as any[];
    } catch {
      tokens = segment.split(/\s+/);
    }

    const flags: Flag[] = [];
    const positionalArgs: string[] = [];
    let binary = '';

    for (const token of tokens) {
      if (typeof token !== 'string') continue;
      if (!binary) {
        binary = token;
        continue;
      }
      if (token.startsWith('--')) {
        const eqIdx = token.indexOf('=');
        if (eqIdx > 0) {
          flags.push({ name: token.substring(2, eqIdx), value: token.substring(eqIdx + 1) });
        } else {
          flags.push({ name: token.substring(2) });
        }
      } else if (token.startsWith('-') && token.length > 1) {
        for (const ch of token.substring(1)) {
          flags.push({ name: ch, short: ch });
        }
      } else {
        positionalArgs.push(token);
      }
    }

    return {
      binary,
      positionalArgs,
      flags,
      raw: segment,
      hasPipes,
      hasRedirects: /\s>>?|</.test(segment),
      hasLogicalOperators: /&&|\|\|/.test(segment),
    };
  }

  // =========================================================================
  // Selector DSL 匹配引擎
  // =========================================================================

  /** Top-level selector match: handles hasPipes, rawPattern, anySegment, then primary sig. */
  private matchRuleSelector(
    rule: YAMLRule,
    signatures: CommandSignature[],
    raw: string,
    context: CommandContext,
  ): MatchResult {
    const sel = rule.selector!;
    const triggered: string[] = [];
    const hasPipes = signatures.length > 1;

    // hasPipes check
    if (sel.hasPipes !== undefined && sel.hasPipes !== hasPipes) return { matched: false };
    if (sel.hasPipes && hasPipes) triggered.push('hasPipes');

    // rawPattern: match against the full raw command string
    if (sel.rawPattern) {
      try {
        if (!new RegExp(sel.rawPattern, 'i').test(raw)) return { matched: false };
        triggered.push('rawPattern');
      } catch (e: any) {
        this.logger.warn(`Invalid rawPattern '${sel.rawPattern}': ${e.message}`);
        return { matched: false };
      }
    }

    // anySegment: at least one pipeline segment satisfies the sub-selector
    if (sel.anySegment) {
      if (!signatures.some(s => this.matchSigBySelector(sel.anySegment!, s))) {
        return { matched: false };
      }
      triggered.push('anySegment');
    }

    // Find primary signature (the one matching sel.binary)
    let primarySig: CommandSignature | undefined;
    if (sel.binary) {
      const binaries = Array.isArray(sel.binary) ? sel.binary : [sel.binary];
      primarySig = signatures.find(s => binaries.includes(s.binary) || binaries.includes('*'));
      if (!primarySig) return { matched: false };
      triggered.push(`binary:${primarySig.binary}`);
    } else {
      primarySig = signatures[0];
    }

    // Check subcommands, flags, arguments on primary signature
    if (primarySig) {
      if (sel.subcommands) {
        for (let i = 0; i < sel.subcommands.length; i++) {
          if (primarySig.positionalArgs[i] !== sel.subcommands[i]) return { matched: false };
        }
        triggered.push(`subcommands:${sel.subcommands.join(' ')}`);
      }

      if (sel.flags) {
        const hasF = (name: string) => primarySig!.flags.some(f => f.name === name || f.short === name);
        const { anyOf, allOf, noneOf, allGroups } = sel.flags;
        if (anyOf && !anyOf.some(hasF)) return { matched: false };
        if (allOf && !allOf.every(hasF)) return { matched: false };
        if (noneOf && noneOf.some(hasF)) return { matched: false };
        if (allGroups) {
          for (const group of allGroups) {
            if (!group.some(hasF)) return { matched: false };
          }
        }
        triggered.push('flags');
      }

      if (sel.arguments) {
        for (const argSel of sel.arguments) {
          const regex = argSel._regex ?? (() => {
            try { return new RegExp(argSel.pattern, 'i'); } catch { return null; }
          })();
          if (!regex) {
            this.logger.warn(`Invalid argument pattern '${argSel.pattern}'`);
            return { matched: false };
          }
          const anyPosition = argSel.anyPosition !== false;
          if (anyPosition) {
            if (!primarySig.positionalArgs.some(a => regex.test(a))) return { matched: false };
          } else if (argSel.position !== undefined) {
            if (!regex.test(primarySig.positionalArgs[argSel.position] ?? '')) return { matched: false };
          }
          triggered.push(`arg:${argSel.pattern}`);
        }
      }
    }

    // Context checks
    if (sel.contextChecks) {
      const ctx = sel.contextChecks;
      if (ctx.gitBranch && context.git) {
        if (!ctx.gitBranch.includes(context.git.currentBranch)) return { matched: false };
        triggered.push(`git-branch:${context.git.currentBranch}`);
      }
      if (ctx.isProduction !== undefined && context.project) {
        if (context.project.isProduction !== ctx.isProduction) return { matched: false };
        triggered.push(`production:${ctx.isProduction}`);
      }
    }

    return {
      matched: true,
      severity: rule.severity || 'warn',
      action: rule.action || 'review',
      description: rule.description,
      reason: rule.reason,
      source: rule.id,
      metadata: {
        triggeredRules: triggered,
        triggeredCount: triggered.length,
        riskLevel: this.severityToRiskLevel(rule.severity),
      },
    };
  }

  /** Pure boolean check: does this CommandSignature satisfy the given Selector? Used by anySegment. */
  private matchSigBySelector(sel: Selector, sig: CommandSignature): boolean {
    if (sel.binary) {
      const binaries = Array.isArray(sel.binary) ? sel.binary : [sel.binary];
      if (!binaries.includes(sig.binary) && !binaries.includes('*')) return false;
    }

    if (sel.subcommands) {
      for (let i = 0; i < sel.subcommands.length; i++) {
        if (sig.positionalArgs[i] !== sel.subcommands[i]) return false;
      }
    }

    if (sel.flags) {
      const hasF = (name: string) => sig.flags.some(f => f.name === name || f.short === name);
      const { anyOf, allOf, noneOf, allGroups } = sel.flags;
      if (anyOf && !anyOf.some(hasF)) return false;
      if (allOf && !allOf.every(hasF)) return false;
      if (noneOf && noneOf.some(hasF)) return false;
      if (allGroups) {
        for (const group of allGroups) {
          if (!group.some(hasF)) return false;
        }
      }
    }

    if (sel.arguments) {
      for (const argSel of sel.arguments) {
        const regex = argSel._regex ?? (() => {
          try { return new RegExp(argSel.pattern, 'i'); } catch { return null; }
        })();
        if (!regex) return false;
        const anyPosition = argSel.anyPosition !== false;
        if (anyPosition) {
          if (!sig.positionalArgs.some(a => regex.test(a))) return false;
        } else if (argSel.position !== undefined) {
          if (!regex.test(sig.positionalArgs[argSel.position] ?? '')) return false;
        }
      }
    }

    return true;
  }

  // =========================================================================
  // 结果聚合 — 确定性优先级
  // =========================================================================

  private aggregateResults(results: MatchResult[], lang: string = 'en'): RuleEvaluation {
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
      reason: resolveReason(top.reason, lang) || top.description || 'Rule matched',
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

  private readonly customRulesPath = path.join(os.homedir(), '.aegis', 'rules', 'custom.yaml');
  private readonly disabledRulesPath = path.join(os.homedir(), '.aegis', 'rules', '.disabled.json');

  private getDisabledRuleIds(): Set<string> {
    try {
      if (!fs.existsSync(this.disabledRulesPath)) return new Set();
      const ids = JSON.parse(fs.readFileSync(this.disabledRulesPath, 'utf8'));
      return new Set(Array.isArray(ids) ? ids : []);
    } catch {
      return new Set();
    }
  }

  private saveDisabledRuleIds(ids: Set<string>): void {
    fs.mkdirSync(path.dirname(this.disabledRulesPath), { recursive: true });
    fs.writeFileSync(this.disabledRulesPath, JSON.stringify([...ids], null, 2), 'utf8');
  }

  private readCustomRuleSet(): YAMLRuleSet {
    if (!fs.existsSync(this.customRulesPath)) {
      return { name: 'custom', version: '1.0', rules: [] };
    }
    try {
      const parsed = yaml.load(fs.readFileSync(this.customRulesPath, 'utf8')) as YAMLRuleSet;
      return parsed?.rules ? parsed : { name: 'custom', version: '1.0', rules: [] };
    } catch {
      return { name: 'custom', version: '1.0', rules: [] };
    }
  }

  private writeCustomRuleSet(ruleSet: YAMLRuleSet): void {
    fs.mkdirSync(path.dirname(this.customRulesPath), { recursive: true });
    const toWrite = {
      ...ruleSet,
      rules: ruleSet.rules.map(({ _source, ...r }: any) => {
        if (r.selector?.arguments) {
          r.selector.arguments = r.selector.arguments.map(({ _regex, ...a }: any) => a);
        }
        return r;
      }),
    };
    fs.writeFileSync(this.customRulesPath, yaml.dump(toWrite, { lineWidth: 120 }), 'utf8');
  }

  getAllRules(): (YAMLRule & { enabled: boolean })[] {
    const disabled = this.getDisabledRuleIds();
    const all: (YAMLRule & { enabled: boolean })[] = [];
    for (const rs of this.ruleSets.values()) {
      for (const rule of rs.rules.values()) {
        const { _source, ...plainRule } = rule as any;
        // Strip pre-compiled regexes before returning to client
        if (plainRule.selector?.arguments) {
          plainRule.selector.arguments = plainRule.selector.arguments.map(({ _regex, ...a }: any) => a);
        }
        all.push({ ...plainRule, _source, enabled: !disabled.has(rule.id!) && rule.severity !== 'off' });
      }
    }
    return all;
  }

  createRule(rule: Partial<YAMLRule>): YAMLRule {
    const ruleSet = this.readCustomRuleSet();
    if (ruleSet.rules.some(r => r.id === rule.id)) {
      throw new Error(`Rule "${rule.id}" already exists`);
    }
    ruleSet.rules.push(rule as YAMLRule);
    this.writeCustomRuleSet(ruleSet);
    this.reloadRules();
    return rule as YAMLRule;
  }

  updateRule(id: string, updates: Partial<YAMLRule>): YAMLRule | null {
    const ruleSet = this.readCustomRuleSet();
    const idx = ruleSet.rules.findIndex(r => r.id === id);
    if (idx >= 0) {
      ruleSet.rules[idx] = { ...ruleSet.rules[idx], ...updates, id };
    } else {
      ruleSet.rules.push({ ...updates, id } as YAMLRule);
    }
    this.writeCustomRuleSet(ruleSet);
    this.reloadRules();
    for (const rs of this.ruleSets.values()) {
      const rule = rs.rules.get(id);
      if (rule) return rule;
    }
    return null;
  }

  deleteRule(id: string): boolean {
    let changed = false;
    const ruleSet = this.readCustomRuleSet();
    const idx = ruleSet.rules.findIndex(r => r.id === id);
    if (idx >= 0) {
      ruleSet.rules.splice(idx, 1);
      this.writeCustomRuleSet(ruleSet);
      changed = true;
    }
    const disabled = this.getDisabledRuleIds();
    if (disabled.delete(id)) {
      this.saveDisabledRuleIds(disabled);
      changed = true;
    }
    if (changed) this.reloadRules();
    return changed;
  }

  toggleRule(id: string): { id: string; enabled: boolean } | null {
    let found = false;
    for (const rs of this.ruleSets.values()) {
      if (rs.rules.has(id)) { found = true; break; }
    }
    if (!found) return null;
    const disabled = this.getDisabledRuleIds();
    const wasDisabled = disabled.has(id);
    wasDisabled ? disabled.delete(id) : disabled.add(id);
    this.saveDisabledRuleIds(disabled);
    return { id, enabled: wasDisabled };
  }

  getRulesSummary() {
    const all = this.getAllRules();
    return {
      total: all.length,
      bySource: {
        'built-in': all.filter(r => r._source === 'built-in').length,
        'user': all.filter(r => r._source === 'user').length,
        'project': all.filter(r => r._source === 'project').length,
      },
      userRulesDir: this.userRulesDir,
    };
  }

  getRuleSet(name: string): ResolvedRuleSet | undefined {
    return this.ruleSets.get(name);
  }

  reloadRules(): void {
    this.ruleSets.clear();
    this.ruleIndex.clear();
    this.fullPatternRules = [];
    this.severityOverrides.clear();
    this.projectRulesCache.clear();
    this.loadConfig();
    this.loadBuiltInRules();
    this.loadUserRules();
    this.applyConfigOverrides();
  }

  getUserRulesDir(): string {
    return this.userRulesDir;
  }

  testDraftRule(
    ruleData: Partial<YAMLRule>,
    commandStr: string,
    ast: CommandNode,
    context: CommandContext,
  ): { matched: boolean; action: string; severity: string; triggeredConditions: string[] } {
    const rule: YAMLRule = {
      id: ruleData.id || '__draft__',
      description: ruleData.description || '',
      severity: (ruleData.severity as RuleSeverity) || 'warn',
      action: (ruleData.action as RuleAction) || 'review',
      selector: ruleData.selector,
      conditions: ruleData.conditions,
      reason: ruleData.reason,
    };

    if (rule.selector?.arguments) {
      for (const argSel of rule.selector.arguments) {
        try {
          argSel._regex = new RegExp(argSel.pattern, 'i');
        } catch {
          // invalid pattern, match will fail gracefully
        }
      }
    }

    let matchResult: MatchResult;
    if (rule.selector) {
      const signatures = this.bashAst.parse(commandStr);
      const sigs = signatures.length > 0 ? signatures : [{
        binary: ast.binary,
        positionalArgs: [],
        flags: [],
        raw: commandStr,
        hasPipes: false,
        hasRedirects: false,
        hasLogicalOperators: false,
      }];
      matchResult = this.matchRuleSelector(rule, sigs, commandStr, context);
    } else {
      matchResult = this.matchRule(rule, ast, context);
    }

    return {
      matched: matchResult.matched,
      action: matchResult.matched ? (matchResult.action || 'allow') : 'allow',
      severity: matchResult.matched ? (matchResult.severity || 'off') : 'off',
      triggeredConditions: matchResult.metadata?.triggeredRules || [],
    };
  }
}
