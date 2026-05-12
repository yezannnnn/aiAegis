# Aegis: Impact Preview + AI Explainer — Design Spec

**Date:** 2026-05-12  
**Status:** Approved  
**Author:** Max (PM)

---

## Problem Statement

Based on 7 real Reddit incidents, the core pain point is:

> When an AI agent is about to execute a destructive operation, the user has no way to see the **actual impact** before it happens, and there is no forced friction mechanism.

### Evidence (real incidents)

| Incident | Root Cause | Loss |
|----------|-----------|------|
| 717GB Windows deleted | Shell parsing collapsed path to `\` (C: root) | 717 GB |
| 25,000 Firestore docs deleted | AI grabbed wrong project's credentials from Downloads | 25K docs |
| 150GB project folder deleted | Context compaction caused AI to lose folder scope constraint | 150 GB |
| Docker volume wiped | AI said "don't worry" overriding user's safety instinct | Dev data |
| cleancode plugin (no incident) | Explicit user command required before any rewrite | 0 loss |

**Common structure across all incidents:**
```
User sets operation boundary
→ AI executes outside that boundary  
→ No mechanism warns user before it's too late
→ Irreversible
```

---

## Solution: Two-Layer Enhancement to ApprovalModal

### Layer 1: Impact Preview (always on, local-only)

Before showing the approval window for destructive file commands, Aegis runs **read-only recon commands** to gather real impact data, then displays it in the approval window.

**Triggers on:**
- `rm -rf`, `rm -r`, `rm -f`
- `rmdir`
- `mv` (when overwriting existing target)

**Does NOT trigger for** (rule engine handles these):
- `git push --force`
- `DROP TABLE`
- `terraform destroy`
- `docker rm`

**Data gathered (via read-only shell commands):**
- File count: `find <path> -type f | wc -l`
- Total size: `du -sh <path>`
- Sample file listing: `ls <path> | head -10`

**UI placement:** New section in `ApprovalModal.vue` between the command display and the details grid. Uses amber/warning color scheme (`#f59e0b`) to distinguish from existing green (safe) and red (danger) elements.

**Fields shown:**
- TARGET PATH
- FILES (count)
- TOTAL SIZE
- REVERSIBLE: always "NO — permanent deletion"
- Sample file names (up to 5, to surface credentials/sensitive files)

### Layer 2: AI Explainer (optional, requires API key)

When the user has configured an AI API key, after Impact Preview data is gathered, Aegis calls the AI to:
1. Explain the command in plain language
2. Flag sensitive file types detected (`.env`, `credentials.json`, `.pem`, `*.sql`)
3. Surface risk if the path looks unrelated to a typical project

**UI placement:** Section below Impact Preview. Uses indigo color scheme (`#818cf8`) with "OPTIONAL · API KEY REQUIRED" badge.

**Supported AI providers:**
- Anthropic (Claude)
- OpenAI
- DeepSeek

**Configuration:**
```bash
aegis config set ai.provider anthropic --key sk-ant-xxx
```

---

## Architecture

### Backend changes

**New service: `impact-preview.service.ts`**
```
ImpactPreviewService
  ├── shouldPreview(ast: CommandAST): boolean
  │   └── checks binary in [rm, rmdir, mv] + flags
  ├── gatherPreview(ast: CommandAST): Promise<ImpactPreview>
  │   ├── extractTargetPath(ast)
  │   ├── countFiles(path) → runs: find <path> -type f | wc -l
  │   ├── getSize(path)    → runs: du -sh <path>
  │   └── sampleFiles(path) → runs: ls <path> | head -10
  └── ImpactPreview {
        targetPath: string
        fileCount: number
        totalSize: string
        sampleFiles: string[]
        sensitiveFilesFound: string[]
      }
```

**New optional service: `ai-explainer.service.ts`**
```
AIExplainerService
  ├── isConfigured(): boolean
  ├── explain(command, impactPreview): Promise<AIExplanation>
  └── AIExplanation {
        plainText: string
        alerts: string[]
      }
```

**Modified: `rule-matcher.service.ts`**
- After deciding `action: review`, call `ImpactPreviewService.gatherPreview()`
- Attach result to the approval event payload

**Modified: `rules.controller.ts`**
- Pass `impactPreview` and `aiExplanation` in the WebSocket event to frontend

### Frontend changes

**Modified: `ApprovalModal.vue`**
- New `impactPreview` prop (optional)
- New `aiExplanation` prop (optional)
- New `<ImpactPreviewSection>` component (amber theme)
- New `<AIExplainerSection>` component (indigo theme, only rendered if aiExplanation exists)

---

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Working directory boundary | Not implemented | Aegis has no reliable project scope signal |
| Database operations | Out of scope (Phase 1) | Requires DB connection context, different technical path |
| SSH payload extraction | Out of scope (Phase 1) | Covered by separate ssh/sshpass review rule |
| AI required vs optional | Optional | Preserves local-only core promise |
| Impact scan timeout | 3 seconds max | Agent shouldn't wait too long; fallback to no preview if timeout |
| Sensitive file detection | Client-side pattern match on sample filenames | No need for AI; simple regex on `.env`, `credentials`, `.pem`, `.key`, `.sql` |

---

## What This Solves (mapped to incidents)

| Incident | How Impact Preview helps |
|----------|-------------------------|
| 717GB | Shows "4.2 GB, 50,000 files" — user sees scale mismatch immediately |
| 25K docs | Shows credentials.json in sample files — user recognizes wrong project |
| 150GB | Shows full path being deleted — user sees it's not the two sub-folders |
| Container | Aegis still pops confirmation regardless of AI's "don't worry" |

---

## Out of Scope (Phase 1)

- Database operation preview (row counts, table names)
- SSH nested command payload extraction
- Working directory boundary detection
- Windows-specific path handling
- Undo / snapshot before deletion

---

## Reddit Narrative

This feature directly addresses the 717GB incident:

> "If Aegis had been running, the approval window would have shown: **4.2 GB, 50,000 files, NO — permanent deletion**. The user would have seen the scale, realized something was wrong, and clicked Deny."

The cleancode plugin case shows the design principle: **explicit human confirmation with visible impact = no accidents**.
