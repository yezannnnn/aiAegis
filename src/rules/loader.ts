/**
 * Rule Loader — ESLint-like extends + user overrides.
 *
 * Two-layer system:
 *   1. Rule PACKAGES (aegis/recommended, community) — define patterns + default severity
 *   2. User CONFIG (~/.aegis/rules.yaml) — extends rule packages + severity overrides
 *
 * Supports extends:
 *   - aegis/recommended   → built-in defaults
 *   - github:user/repo    → GitHub raw rules.yaml
 *   - npm:pkg-name        → npm package
 *   - https://...         → remote URL
 *   - ./path/to/file      → local file
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYAML } from "yaml";
import { RuleDef, RulePackage, RuleSeverity, UserRuleOverrides, ResolvedRule } from "../ast/types";
import { mergeRuleDefs, resolveRules } from "./engine";

/** Raw structure of a rules.yaml config file (user-side) */
interface RawUserConfig {
  extends?: string[];
  rules?: Record<string, RuleSeverity>;
}

/** Raw structure of a rule package file (community-side) */
interface RawRulePackage {
  name?: string;
  version?: string;
  rules?: RawPackageRule[];
}

interface RawPackageRule {
  pattern: string;
  description: string;
  category?: string;
  /** "block" | "error" | "warn" — will be resolved to defaultSeverity */
  severity?: string;
}

// =========================================================================
// Built-in defaults
// =========================================================================

/** Built-in rule sets map: aegis/name → file path */
const BUILTIN_RULE_SETS: Record<string, string> = {
  "aegis/recommended": "defaults.yaml",
  "aegis/mysql": "mysql.yaml",
  "aegis/nestjs": "nestjs.yaml",
  "aegis/prisma": "prisma.yaml",
  "aegis/vue3": "vue3.yaml",
  "aegis/git": "git.yaml",
};

function loadBuiltinDefaults(): RuleDef[] {
  const jsonPath = path.join(__dirname, "defaults.json");
  if (fs.existsSync(jsonPath)) {
    return loadPackageRulesJson(jsonPath);
  }

  // Fallback to YAML for backward compatibility
  const yamlPaths = [
    path.join(__dirname, "defaults.yaml"),
    path.join(__dirname, "..", "..", "rules.yaml"),
  ];
  for (const p of yamlPaths) {
    if (fs.existsSync(p)) {
      return loadPackageRules(p);
    }
  }

  return [];
}

function loadBuiltinRuleSet(name: string): RuleDef[] {
  const fileName = BUILTIN_RULE_SETS[name];
  if (!fileName) {
    return [];
  }
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return loadPackageRules(filePath);
}

// =========================================================================
// Package loading
// =========================================================================

function parseSeverity(s: string | undefined, fallback: RuleSeverity): RuleSeverity {
  if (s === "block" || s === "error" || s === "warn" || s === "off") return s;
  return fallback;
}

function loadPackageRulesJson(filePath: string): RuleDef[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const pkg = JSON.parse(content) as RawRulePackage;

  if (!pkg.rules) return [];

  return pkg.rules.map((r) => ({
    pattern: r.pattern,
    description: r.description,
    category: r.category,
    defaultSeverity: parseSeverity(r.severity, "error"),
    source: pkg.name || filePath,
  }));
}

function loadPackageRules(filePath: string): RuleDef[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const pkg = parseYAML(content) as RawRulePackage;

  if (!pkg.rules) return [];

  return pkg.rules.map((r) => ({
    pattern: r.pattern,
    description: r.description,
    category: r.category,
    defaultSeverity: parseSeverity(r.severity, "error"),
    source: pkg.name || filePath,
  }));
}

// =========================================================================
// Extends resolution
// =========================================================================

interface ResolvedRef {
  type: "builtin" | "local" | "url" | "npm";
  resolved: string;
}

function resolveExtendsRef(ref: string): ResolvedRef {
  if (ref.startsWith("aegis/")) return { type: "builtin", resolved: ref };
  if (ref.startsWith("github:")) {
    return { type: "url", resolved: `https://raw.githubusercontent.com/${ref.slice(7)}/main/rules.yaml` };
  }
  if (ref.startsWith("npm:")) return { type: "npm", resolved: ref.slice(4) };
  if (ref.startsWith("http://") || ref.startsWith("https://")) return { type: "url", resolved: ref };
  return { type: "local", resolved: ref };
}

async function loadExtendsRules(ref: string, errors: string[]): Promise<RuleDef[]> {
  const { type, resolved } = resolveExtendsRef(ref);

  try {
    switch (type) {
      case "builtin":
        if (resolved === "aegis/recommended") {
          return loadBuiltinDefaults();
        }
        return loadBuiltinRuleSet(resolved);

      case "local": {
        const fullPath = path.resolve(resolved);
        if (!fs.existsSync(fullPath)) {
          errors.push(`File not found: ${fullPath}`);
          return [];
        }
        return loadPackageRules(fullPath);
      }

      case "url": {
        const resp = await fetch(resolved, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
          errors.push(`HTTP ${resp.status} from ${ref}`);
          return [];
        }
        const text = await resp.text();
        const pkg = parseYAML(text) as RawRulePackage;
        if (!pkg.rules) return [];
        return pkg.rules.map((r) => ({
          pattern: r.pattern,
          description: r.description,
          category: r.category,
          defaultSeverity: parseSeverity(r.severity, "error"),
          source: pkg.name || ref,
        }));
      }

      case "npm": {
        const pkgPath = require.resolve(`${resolved}/rules.yaml`, {
          paths: [process.cwd(), path.join(process.env.HOME || "~", ".aegis")],
        });
        return loadPackageRules(pkgPath);
      }

      default:
        return [];
    }
  } catch (err: any) {
    errors.push(`Failed to load ${ref}: ${err.message}`);
    return [];
  }
}

// =========================================================================
// Main loader
// =========================================================================

export interface LoadResult {
  /** Resolved rules ready for the engine */
  rules: ResolvedRule[];
  /** All rule definitions (before user overrides) */
  definitions: RuleDef[];
  /** User overrides applied */
  overrides: UserRuleOverrides;
  /** Load sources */
  sources: string[];
  /** Errors during loading */
  errors: string[];
}

export async function loadRules(userConfigPath: string): Promise<LoadResult> {
  const errors: string[] = [];
  const sources: string[] = [];
  const allDefs: RuleDef[][] = [];

  let extendsRefs: string[] = [];
  let userOverrides: UserRuleOverrides = {};

  // Load user config
  if (fs.existsSync(userConfigPath)) {
    try {
      const raw = parseYAML(fs.readFileSync(userConfigPath, "utf-8")) as RawUserConfig;
      extendsRefs = raw.extends || [];
      userOverrides = raw.rules || {};
      sources.push(userConfigPath);
    } catch (err: any) {
      errors.push(`Config parse error: ${err.message}`);
    }
  }

  // No extends → use default
  if (extendsRefs.length === 0) {
    extendsRefs = ["aegis/recommended"];
  }

  // Load each extends
  for (const ref of extendsRefs) {
    const defs = await loadExtendsRules(ref, errors);
    allDefs.push(defs);
    sources.push(ref);
  }

  // Merge
  const definitions = mergeRuleDefs(allDefs);
  // Process user overrides to extract severity values
  const processedOverrides: Record<string, RuleSeverity> = {};
  if (userOverrides.rules) {
    for (const [key, value] of Object.entries(userOverrides.rules)) {
      processedOverrides[key] = Array.isArray(value) ? value[0] : value;
    }
  }
  const rules = resolveRules(definitions, processedOverrides);

  return { rules, definitions, overrides: userOverrides, sources, errors };
}
