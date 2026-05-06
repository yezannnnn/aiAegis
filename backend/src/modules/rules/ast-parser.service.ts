import { Injectable } from '@nestjs/common';
import * as shellQuote from 'shell-quote';
import { CommandNode, FlagNode, ArgumentNode } from './types';

@Injectable()
export class AstParserService {
  /**
   * 解析命令字符串为 AST
   */
  parse(command: string): CommandNode {
    try {
      const tokens = shellQuote.parse(command);
      return this.tokensToAST(tokens, command);
    } catch (error) {
      return this.createFallbackAST(command);
    }
  }

  private tokensToAST(tokens: any[], originalCommand: string): CommandNode {
    const result: CommandNode = {
      type: 'command',
      raw: originalCommand,
      span: [0, originalCommand.length],
      binary: '',
      subcommands: [],
      flags: [],
      arguments: [],
    };

    for (const token of tokens) {
      if (typeof token === 'string') {
        if (!result.binary) {
          result.binary = token;
        } else if (this.looksLikeSubcommand(token, result.binary)) {
          result.subcommands.push(token);
        } else if (token.startsWith('-')) {
          // 展开合并的短 flag，如 -rf → -r -f
          const expanded = this.expandCombinedFlags(token, originalCommand);
          result.flags.push(...expanded);
        } else {
          result.arguments.push(this.parseArgument(token, originalCommand));
        }
      }
    }

    return result;
  }

  /** 展开合并的短 flag：-rf → [{name:'r'}, {name:'f'}]；长 flag 和带值 flag 不展开 */
  private expandCombinedFlags(flag: string, originalCommand: string): FlagNode[] {
    // 长 flag（--xxx）或带 = 的 flag 不展开
    if (flag.startsWith('--') || flag.includes('=')) {
      return [this.parseFlag(flag, originalCommand)];
    }

    // 短 flag 合并形式：-rf
    const chars = flag.substring(1);
    if (chars.length <= 1) {
      return [this.parseFlag(flag, originalCommand)];
    }

    // 展开每个字符为独立 flag
    const span = this.findSpan(flag, originalCommand);
    return Array.from(chars).map(ch => ({
      type: 'flag' as const,
      raw: `-${ch}`,
      span,
      name: ch,
      short: ch,
      hasValue: false,
    }));
  }

  private looksLikeSubcommand(token: string, binary: string): boolean {
    const knownSubcommands: Record<string, string[]> = {
      git: ['add', 'commit', 'push', 'pull', 'merge', 'rebase', 'branch', 'checkout', 'reset', 'clean', 'stash', 'fetch', 'clone', 'init', 'remote', 'tag', 'log', 'diff', 'status', 'show', 'cherry-pick', 'bisect', 'revert', 'mv', 'rm', 'config', 'gc', 'prune', 'submodule', 'worktree', 'blame', 'grep', 'describe', 'format-patch', 'am', 'apply', 'archive', 'bundle', 'fsck', 'reflog', 'shortlog', 'notes', 'range-diff', 'restore', 'switch', 'sparse-checkout', 'maintenance'],
      docker: ['build', 'run', 'exec', 'pull', 'push', 'ps', 'logs', 'stop', 'rm', 'rmi', 'start', 'restart', 'create', 'attach', 'commit', 'cp', 'diff', 'events', 'export', 'history', 'images', 'import', 'info', 'inspect', 'kill', 'load', 'login', 'logout', 'pause', 'port', 'rename', 'save', 'search', 'stats', 'tag', 'top', 'unpause', 'update', 'version', 'wait', 'container', 'image', 'volume', 'network', 'system', 'compose', 'swarm', 'service', 'stack', 'config', 'node', 'plugin', 'secret', 'trust'],
      npm: ['install', 'uninstall', 'update', 'run', 'test', 'build', 'publish', 'audit', 'init', 'start', 'stop', 'restart', 'link', 'unlink', 'ls', 'list', 'search', 'view', 'info', 'outdated', 'prune', 'shrinkwrap', 'version', 'config', 'cache', 'doctor', 'dedupe', 'diff', 'dist-tag', 'docs', 'edit', 'explore', 'fund', 'help', 'hook', 'pack', 'prefix', 'rebuild', 'repo', 'root', 'star', 'stars', 'team', 'token', 'whoami', 'access', 'adduser', 'ci', 'completion', 'deprecate', 'exec', 'explain', 'find-dupes', 'login', 'logout', 'org', 'owner', 'ping', 'pkg', 'profile', 'query', 'set', 'unpublish', 'unstar'],
      mysql: ['create', 'drop', 'alter', 'select', 'insert', 'update', 'delete', 'grant', 'revoke', 'flush', 'set', 'show', 'use', 'describe', 'explain', 'rename', 'truncate', 'load', 'replace', 'begin', 'commit', 'rollback', 'lock', 'unlock', 'call', 'prepare', 'execute', 'deallocate', 'handler', 'help', 'kill', 'optimize', 'purge', 'reset', 'start', 'stop', 'analyze', 'check', 'checksum', 'repair', 'backup', 'restore', 'install', 'uninstall', 'shutdown'],
      kubectl: ['get', 'create', 'apply', 'delete', 'describe', 'logs', 'exec', 'edit', 'expose', 'rollout', 'scale', 'set', 'annotate', 'autoscale', 'cluster-info', 'completion', 'config', 'cordn', 'cp', 'drain', 'explain', 'label', 'patch', 'port-forward', 'proxy', 'replace', 'run', 'taint', 'top', 'uncordon', 'wait'],
      systemctl: ['start', 'stop', 'restart', 'enable', 'disable', 'status', 'mask', 'unmask', 'reload', 'daemon-reload', 'is-active', 'is-enabled', 'is-failed', 'list-units', 'list-timers', 'list-sockets', 'list-dependencies', 'show', 'cat', 'edit', 'set-property', 'isolate', 'rescue', 'emergency', 'default', 'halt', 'poweroff', 'reboot', 'kexec', 'suspend', 'hibernate', 'hybrid-sleep'],
      cargo: ['build', 'run', 'test', 'check', 'clean', 'doc', 'update', 'install', 'uninstall', 'publish', 'add', 'remove', 'fmt', 'clippy', 'bench', 'fix', 'new', 'init', 'search', 'tree', 'metadata', 'config', 'login', 'logout', 'owner', 'package', 'rustc', 'rustdoc', 'vendor', 'verify-project', 'version', 'yank'],
      go: ['build', 'run', 'test', 'get', 'install', 'mod', 'fmt', 'vet', 'clean', 'doc', 'env', 'fix', 'generate', 'list', 'work', 'tool'],
      pip: ['install', 'uninstall', 'download', 'list', 'show', 'check', 'config', 'search', 'freeze', 'hash', 'wheel', 'completion', 'debug', 'cache'],
      pip3: ['install', 'uninstall', 'download', 'list', 'show', 'check', 'config', 'search', 'freeze', 'hash', 'wheel', 'completion', 'debug', 'cache'],
      brew: ['install', 'uninstall', 'update', 'upgrade', 'list', 'search', 'info', 'doctor', 'cleanup', 'config', 'deps', 'edit', 'fetch', 'home', 'leaves', 'link', 'unlink', 'log', 'migrate', 'outdated', 'pin', 'unpin', 'postinstall', 'prune', 'reinstall', 'services', 'tap', 'untap', 'uses', 'formula', 'cask', 'bundle'],
      apt: ['install', 'remove', 'update', 'upgrade', 'search', 'list', 'show', 'autoremove', 'purge', 'clean', 'dist-upgrade', 'full-upgrade', 'edit-sources', 'download', 'policy', 'markauto', 'unmarkauto'],
      'apt-get': ['install', 'remove', 'update', 'upgrade', 'dist-upgrade', 'autoremove', 'purge', 'clean', 'autoclean', 'check', 'download', 'source'],
      yum: ['install', 'remove', 'update', 'upgrade', 'search', 'list', 'info', 'clean', 'check-update', 'deplist', 'downgrade', 'erase', 'groupinstall', 'groupremove', 'groupupdate', 'grouplist', 'localinstall', 'localupdate', 'makecache', 'provides', 'reinstall', 'repolist', 'resolvedep'],
      dnf: ['install', 'remove', 'update', 'upgrade', 'search', 'list', 'info', 'clean', 'check-update', 'downgrade', 'erase', 'group', 'history', 'makecache', 'provides', 'reinstall', 'repolist', 'autoremove'],
      pnpm: ['install', 'add', 'remove', 'update', 'run', 'test', 'build', 'publish', 'audit', 'init', 'start', 'link', 'unlink', 'list', 'outdated', 'prune', 'store', 'config', 'setup', 'doctor', 'patch', 'patch-remove', 'approve-builds', 'rebuild', 'deploy', 'env'],
      yarn: ['install', 'add', 'remove', 'upgrade', 'run', 'test', 'build', 'publish', 'audit', 'init', 'start', 'link', 'unlink', 'list', 'outdated', 'config', 'cache', 'global', 'info', 'login', 'logout', 'pack', 'set', 'tag', 'team', 'version', 'workspace', 'workspaces', 'dlx'],
      gh: ['pr', 'issue', 'repo', 'auth', 'run', 'release', 'gist', 'codespace', 'org', 'secret', 'label', 'project', 'search', 'status', 'alias', 'api', 'attestation', 'browse', 'cache', 'completion', 'config', 'extension', 'gpg-key', 'notifications', 'ruleset', 'ssh-key', 'variable', 'workflow'],
      npx: ['prisma', 'vite', 'vitest', 'jest', 'eslint', 'prettier', 'tsc', 'ts-node', 'webpack', 'rollup', 'nest', 'next', 'nuxt', 'astro', 'storybook', 'playwright', 'cypress', 'mocha', 'ava', 'nodemon', 'pm2', 'sequelize', 'typeorm', 'mikro-orm', 'knex', 'graphql-codegen', 'nx', 'lerna', 'turbo', 'changeset'],
      python: ['-m', '-c', '-mhttp.server', '-mpip'],
      python3: ['-m', '-c', '-mhttp.server', '-mpip'],
      node: ['-e', '-p', '--eval', '--print', '--inspect', '--inspect-brk', '--require', '-r'],
    };

    return knownSubcommands[binary]?.includes(token) || false;
  }

  private parseFlag(flag: string, originalCommand: string): FlagNode {
    const span = this.findSpan(flag, originalCommand);
    const equalIndex = flag.indexOf('=');

    if (equalIndex > 0) {
      const name = flag.substring(2, equalIndex);
      const value = flag.substring(equalIndex + 1);
      return {
        type: 'flag',
        raw: flag,
        span,
        name,
        value,
        hasValue: true,
        short: this.getShortFlag(name),
      };
    }

    const name = flag.startsWith('--') ? flag.substring(2) : flag.substring(1);
    const isShort = flag.startsWith('-') && !flag.startsWith('--');

    return {
      type: 'flag',
      raw: flag,
      span,
      name,
      short: isShort ? name : this.getShortFlag(name),
      hasValue: false,
    };
  }

  private parseArgument(arg: string, originalCommand: string): ArgumentNode {
    const span = this.findSpan(arg, originalCommand);

    return {
      type: 'argument',
      raw: arg,
      span,
      value: arg,
      isGlob: /[*?[\]]/.test(arg),
      isPath: this.looksLikePath(arg),
      isURL: this.looksLikeURL(arg),
    };
  }

  private getShortFlag(longName: string): string | undefined {
    const flagMappings: Record<string, string> = {
      force: 'f',
      verbose: 'v',
      quiet: 'q',
      help: 'h',
      version: 'V',
      recursive: 'r',
      all: 'a',
    };
    return flagMappings[longName];
  }

  private looksLikePath(str: string): boolean {
    return (
      str.includes('/') ||
      str.includes('\\') ||
      str.startsWith('./') ||
      str.startsWith('../') ||
      str.startsWith('~/')
    );
  }

  private looksLikeURL(str: string): boolean {
    return /^https?:\/\/|^git@|^ssh:\/\//.test(str);
  }

  private findSpan(token: string, originalCommand: string): [number, number] {
    const index = originalCommand.indexOf(token);
    if (index >= 0) {
      return [index, index + token.length];
    }
    return [0, 0];
  }

  private createFallbackAST(command: string): CommandNode {
    const parts = command.trim().split(/\s+/);
    const binary = parts[0] || '';

    return {
      type: 'command',
      raw: command,
      span: [0, command.length],
      binary,
      subcommands: [],
      flags: [],
      arguments: parts.slice(1).map((part) => ({
        type: 'argument',
        raw: part,
        span: [0, 0],
        value: part,
        isGlob: false,
        isPath: false,
        isURL: false,
      })),
    };
  }
}

// =========================================================================
// 便捷函数
// =========================================================================

export function hasFlag(ast: CommandNode, flagName: string): boolean {
  return ast.flags.some(flag => flag.name === flagName || flag.short === flagName);
}

export function getFlagValue(ast: CommandNode, flagName: string): string | undefined {
  const flag = ast.flags.find(f => f.name === flagName || f.short === flagName);
  return flag?.value;
}

export function getArgumentValues(ast: CommandNode): string[] {
  return ast.arguments.map(arg => arg.value);
}
