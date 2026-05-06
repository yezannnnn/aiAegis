/**
 * Aegis Command Parser — Convert shell commands to AST
 *
 * 基于 shell-quote 构建的命令解析器，支持复杂 shell 语法
 */

import * as shellQuote from 'shell-quote';
import { CommandNode, FlagNode, ArgumentNode, BaseNode } from './types';

export class CommandParser {
  /**
   * 解析命令字符串为 AST
   */
  parse(command: string): CommandNode {
    try {
      const tokens = shellQuote.parse(command);
      return this.tokensToAST(tokens, command);
    } catch (error) {
      // 解析失败时返回基础结构
      return this.createFallbackAST(command);
    }
  }

  /**
   * 将 shell-quote tokens 转换为我们的 AST
   */
  private tokensToAST(tokens: any[], originalCommand: string): CommandNode {
    const result: CommandNode = {
      type: 'command',
      raw: originalCommand,
      span: [0, originalCommand.length],
      binary: '',
      flags: [],
      arguments: [],
    };

    let currentIndex = 0;

    for (const token of tokens) {
      if (typeof token === 'string') {
        if (!result.binary) {
          // 第一个 token 是主命令
          result.binary = token;
        } else if (this.looksLikeSubcommand(token, result.binary)) {
          // 识别子命令
          result.subcommand = token;
        } else if (token.startsWith('-')) {
          // 解析 flag
          result.flags.push(this.parseFlag(token, originalCommand));
        } else {
          // 普通参数
          result.arguments.push(this.parseArgument(token, originalCommand));
        }
      }
      // TODO: 处理复杂 token (objects, variables, etc.)
      currentIndex++;
    }

    return result;
  }

  /**
   * 判断是否为子命令
   */
  private looksLikeSubcommand(token: string, binary: string): boolean {
    // 基于已知模式识别子命令
    const knownSubcommands: Record<string, string[]> = {
      git: ['add', 'commit', 'push', 'pull', 'merge', 'rebase', 'branch', 'checkout', 'reset', 'clean', 'stash'],
      docker: ['build', 'run', 'exec', 'pull', 'push', 'ps', 'logs', 'stop', 'rm', 'rmi'],
      npm: ['install', 'uninstall', 'update', 'run', 'test', 'build', 'publish', 'audit'],
      mysql: ['create', 'drop', 'alter', 'select', 'insert', 'update', 'delete'],
      kubectl: ['get', 'create', 'apply', 'delete', 'describe', 'logs', 'exec'],
      systemctl: ['start', 'stop', 'restart', 'enable', 'disable', 'status'],
    };

    return knownSubcommands[binary]?.includes(token) || false;
  }

  /**
   * 解析 flag 节点
   */
  private parseFlag(flag: string, originalCommand: string): FlagNode {
    const span = this.findSpan(flag, originalCommand);

    // 处理 --flag=value 形式
    const equalIndex = flag.indexOf('=');
    if (equalIndex > 0) {
      const name = flag.substring(2, equalIndex); // 去掉 --
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

    // 处理单独 flag
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

  /**
   * 解析参数节点
   */
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

  /**
   * 获取 flag 的短形式映射
   */
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

  /**
   * 判断是否为路径
   */
  private looksLikePath(str: string): boolean {
    return (
      str.includes('/') ||
      str.includes('\\') ||
      str.startsWith('./') ||
      str.startsWith('../') ||
      str.startsWith('~/')
    );
  }

  /**
   * 判断是否为 URL
   */
  private looksLikeURL(str: string): boolean {
    return /^https?:\/\/|^git@|^ssh:\/\//.test(str);
  }

  /**
   * 在原始命令中找到 token 的位置
   */
  private findSpan(token: string, originalCommand: string): [number, number] {
    const index = originalCommand.indexOf(token);
    if (index >= 0) {
      return [index, index + token.length];
    }
    return [0, 0]; // fallback
  }

  /**
   * 解析失败时的后备 AST
   */
  private createFallbackAST(command: string): CommandNode {
    const parts = command.trim().split(/\s+/);
    const binary = parts[0] || '';

    return {
      type: 'command',
      raw: command,
      span: [0, command.length],
      binary,
      flags: [],
      arguments: parts.slice(1).map((part, index) => ({
        type: 'argument',
        raw: part,
        span: [0, 0], // 简化处理
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

/**
 * 解析单个命令
 */
export function parseCommand(command: string): CommandNode {
  const parser = new CommandParser();
  return parser.parse(command);
}

/**
 * 检查命令是否包含特定 flag
 */
export function hasFlag(ast: CommandNode, flagName: string): boolean {
  return ast.flags.some(flag => flag.name === flagName || flag.short === flagName);
}

/**
 * 获取特定 flag 的值
 */
export function getFlagValue(ast: CommandNode, flagName: string): string | undefined {
  const flag = ast.flags.find(f => f.name === flagName || f.short === flagName);
  return flag?.value;
}

/**
 * 检查是否有特定参数
 */
export function hasArgument(ast: CommandNode, value: string): boolean {
  return ast.arguments.some(arg => arg.value === value);
}

/**
 * 获取所有参数值
 */
export function getArgumentValues(ast: CommandNode): string[] {
  return ast.arguments.map(arg => arg.value);
}