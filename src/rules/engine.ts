/**
 * Rules Engine — ESLint-like rule matching with severity levels.
 *
 * Matching priority (first match wins):
 *   1. "block" rules → direct DENY (unconditional)
 *   2. "error" rules → requires user approval
 *   3. "warn" rules  → notify only, auto-allow
 *   (4. "off" rules → skipped entirely)
 *   4. No match      → ALLOW (configurable default mode)
 */

import * as shellQuote from "shell-quote";
import { RuleDef, ResolvedRule, RuleSeverity, MatchResult } from "../ast/types";

export interface EngineConfig {
  /** Default behavior when no rule matches */
  defaultMode: "allow" | "deny" | "warn";
}

const DEFAULT_CONFIG: EngineConfig = {
  defaultMode: "allow",
};

/**
 * Split a raw command string into individual command segments.
 * Handles shell operators (&&, ||, ;, |) and quoted strings.
 */
export function splitCommandSegments(command: string): string[] {
  const cleaned = command
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x00/g, "")
    .trim();

  if (!cleaned) return [];

  // Use shell-quote to parse and split by operators
  const parsed = shellQuote.parse(cleaned);
  const segments: string[][] = [[]];

  for (const token of parsed) {
    if (typeof token === "string" && /^(&&|\|\||;|\|)$/.test(token)) {
      // Operator → start new segment
      segments.push([]);
    } else if (typeof token === "string") {
      segments[segments.length - 1].push(token);
    } else if (typeof token === "object" && "op" in token) {
      // Control operator from shell-quote
      segments.push([]);
    } else {
      // Other token types (comments, env vars, etc.)
      segments[segments.length - 1].push(String(token));
    }
  }

  return segments
    .map((seg) => seg.join(" ").toLowerCase().trim())
    .filter((seg) => seg.length > 0);
}

/**
 * Normalize a command string for pattern matching.
 * @deprecated Use splitCommandSegments + matchCommandSegments instead
 */
export function normalizeCommand(command: string): string {
  return command
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x00/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Check if a single rule's pattern matches the normalized command.
 */
function matchRuleDef(normalized: string, rule: RuleDef): boolean {
  try {
    if (!rule.pattern) return false;
    return new RegExp(rule.pattern, "i").test(normalized);
  } catch {
    return false;
  }
}

/**
 * Match a command segment against the resolved rule set.
 */
function matchSingleSegment(
  segment: string,
  rules: ResolvedRule[],
  config: EngineConfig = DEFAULT_CONFIG,
): MatchResult {
  const normalized = segment.toLowerCase().trim();

  // Separate rules by severity for priority matching
  const blockRules = rules.filter((r) => r.severity === "block");
  const errorRules = rules.filter((r) => r.severity === "error");
  const warnRules = rules.filter((r) => r.severity === "warn");

  // Layer 1: block (unconditional deny)
  for (const rule of blockRules) {
    if (matchRuleDef(normalized, rule.def)) {
      return {
        matched: true,
        severity: "block",
        description: rule.def.description,
        source: rule.def.source,
      };
    }
  }

  // Layer 2: error (requires approval)
  for (const rule of errorRules) {
    if (matchRuleDef(normalized, rule.def)) {
      return {
        matched: true,
        severity: "error",
        description: rule.def.description,
        source: rule.def.source,
      };
    }
  }

  // Layer 3: warn (notify only)
  for (const rule of warnRules) {
    if (matchRuleDef(normalized, rule.def)) {
      return {
        matched: true,
        severity: "warn",
        description: rule.def.description,
        source: rule.def.source,
      };
    }
  }

  // No match → default behavior
  if (config.defaultMode === "deny") {
    return { matched: true, severity: "error", description: "default-deny: no rule matched" };
  }
  if (config.defaultMode === "warn") {
    return { matched: true, severity: "warn", description: "default-warn: no rule matched" };
  }
  return { matched: false };
}

/**
 * Match a command against the resolved rule set.
 * Splits compound commands (&&, ||, ;, |) and checks each segment independently.
 * Returns the highest-severity match found across all segments.
 */
export function matchCommand(
  command: string,
  rules: ResolvedRule[],
  config: EngineConfig = DEFAULT_CONFIG,
): MatchResult {
  const segments = splitCommandSegments(command);

  // If splitting fails or returns empty, fall back to legacy behavior
  if (segments.length === 0) {
    return matchSingleSegment(command, rules, config);
  }

  let bestMatch: MatchResult = { matched: false };

  for (const segment of segments) {
    const result = matchSingleSegment(segment, rules, config);
    if (result.matched) {
      // Priority: block > error > warn
      if (!bestMatch.matched || severityRank(result.severity!) > severityRank(bestMatch.severity!)) {
        bestMatch = result;
      }
    }
  }

  return bestMatch;
}

/** Severity priority ranking for comparison */
function severityRank(s: RuleSeverity): number {
  switch (s) {
    case "block": return 3;
    case "error": return 2;
    case "warn": return 1;
    case "off": return 0;
    default: return 0;
  }
}

/**
 * Resolve effective severity for a rule:
 * user overrides > package default.
 */
export function resolveSeverity(
  rule: RuleDef,
  overrides: Record<string, RuleSeverity> = {},
): RuleSeverity {
  return overrides[rule.description] ?? rule.defaultSeverity;
}

/**
 * Build a resolved rule list from rule definitions + user overrides.
 */
export function resolveRules(
  ruleDefs: RuleDef[],
  overrides: Record<string, RuleSeverity> = {},
): ResolvedRule[] {
  return ruleDefs
    .map((def) => ({
      def,
      severity: resolveSeverity(def, overrides),
    }))
    .filter((r) => r.severity !== "off"); // don't even bother matching "off" rules
}

/**
 * Merge multiple rule definition lists.
 * Later lists override earlier ones on same description (last wins).
 */
export function mergeRuleDefs(sets: RuleDef[][]): RuleDef[] {
  const merged: RuleDef[] = [];
  for (const rules of sets) {
    for (const rule of rules) {
      const idx = merged.findIndex((r) => r.description === rule.description);
      if (idx >= 0) {
        merged[idx] = rule;
      } else {
        merged.push(rule);
      }
    }
  }
  return merged;
}
