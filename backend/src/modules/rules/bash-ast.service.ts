import { Injectable, Logger } from '@nestjs/common';
import * as shellQuote from 'shell-quote';
import { CommandSignature, Flag } from './types';

@Injectable()
export class BashAstService {
  private readonly logger = new Logger(BashAstService.name);

  /**
   * Parse a raw shell command into one or more CommandSignature objects.
   * Pipeline segments each become a separate signature (hasPipes=true).
   * Falls back to shell-quote based splitting if unbash throws.
   */
  parse(raw: string): CommandSignature[] {
    if (!raw || !raw.trim()) return [];
    try {
      return this.parseWithUnbash(raw);
    } catch (e: any) {
      this.logger.debug(`unbash fallback: ${raw.substring(0, 60)} — ${e.message}`);
      return this.parseWithFallback(raw);
    }
  }

  // =========================================================================
  // unbash path
  // =========================================================================

  private parseWithUnbash(raw: string): CommandSignature[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('unbash') as { parse: (s: string) => any };
    const script = parse(raw);
    const signatures: CommandSignature[] = [];

    for (const statement of (script.commands || [])) {
      if (statement.command) {
        this.walkNode(statement.command, signatures, raw, false, false);
      }
    }

    return signatures.length > 0 ? signatures : this.parseWithFallback(raw);
  }

  /**
   * Recursively walk an unbash AST node.
   * - Command   → emit as one CommandSignature
   * - Pipeline  → emit each child Command with hasPipes=true
   * - AndOr     → recurse into the FIRST (primary) child only; set hasLogicalOperators=true
   */
  private walkNode(
    node: any,
    out: CommandSignature[],
    raw: string,
    hasPipes: boolean,
    hasLogical: boolean,
  ): void {
    if (!node) return;

    switch (node.type) {
      case 'Command':
        out.push(this.commandNodeToSignature(node, raw, hasPipes, hasLogical));
        break;

      case 'Pipeline': {
        const pipeCount = (node.commands || []).length;
        const isPiped = pipeCount > 1;
        for (const child of (node.commands || [])) {
          this.walkNode(child, out, raw, isPiped, hasLogical);
        }
        break;
      }

      case 'AndOr': {
        // Recurse into ALL children — each command in a && / || chain must be evaluated
        for (const child of (node.commands || [])) {
          this.walkNode(child, out, raw, hasPipes, true);
        }
        break;
      }

      default:
        this.logger.debug(`Unknown unbash node type: ${node.type}`);
    }
  }

  private commandNodeToSignature(
    node: any,
    raw: string,
    hasPipes: boolean,
    hasLogicalOperators: boolean,
  ): CommandSignature {
    const binary: string = node.name?.value || '';
    const flags: Flag[] = [];
    const positionalArgs: string[] = [];

    for (const token of (node.suffix || [])) {
      const val: string = token.value ?? token.text ?? '';
      if (!val) continue;

      if (val.startsWith('--')) {
        const eqIdx = val.indexOf('=');
        if (eqIdx > 2) {
          flags.push({ name: val.substring(2, eqIdx), value: val.substring(eqIdx + 1) });
        } else {
          flags.push({ name: val.substring(2) });
        }
      } else if (val.startsWith('-') && val.length > 1) {
        // Expand combined short flags: -rf → [{name:'r',short:'r'}, {name:'f',short:'f'}]
        for (const ch of val.substring(1)) {
          flags.push({ name: ch, short: ch });
        }
      } else {
        positionalArgs.push(val);
      }
    }

    const hasRedirects = Array.isArray(node.redirects) && node.redirects.length > 0;
    // Segment raw: slice from AST position if available, else use full raw
    const segmentRaw = (typeof node.pos === 'number' && typeof node.end === 'number')
      ? raw.substring(node.pos, node.end).trim()
      : raw;

    return { binary, positionalArgs, flags, raw: segmentRaw, hasPipes, hasRedirects, hasLogicalOperators };
  }

  // =========================================================================
  // shell-quote fallback path
  // =========================================================================

  private parseWithFallback(raw: string): CommandSignature[] {
    const segments = this.splitPipelineSegments(raw);
    return segments.map(seg => this.segmentToSignatureFallback(seg, segments.length > 1));
  }

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

  private segmentToSignatureFallback(segment: string, hasPipes: boolean): CommandSignature {
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
      const str: string | null = typeof token === 'string' ? token
        : (token as any).op === 'glob' ? (token as any).pattern
        : null;
      if (!str) continue;
      if (!binary) { binary = str; continue; }
      if (str.startsWith('--')) {
        const eqIdx = str.indexOf('=');
        if (eqIdx > 2) {
          flags.push({ name: str.substring(2, eqIdx), value: str.substring(eqIdx + 1) });
        } else {
          flags.push({ name: str.substring(2) });
        }
      } else if (str.startsWith('-') && str.length > 1) {
        for (const ch of str.substring(1)) {
          flags.push({ name: ch, short: ch });
        }
      } else {
        positionalArgs.push(str);
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
}
