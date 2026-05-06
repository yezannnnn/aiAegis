import { Injectable } from '@nestjs/common';
import { CommandContext } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

@Injectable()
export class AstContextService {
  private cache: Map<string, any> = new Map();

  /**
   * 收集命令执行的完整上下文
   */
  async collectContext(cwd: string = process.cwd()): Promise<CommandContext> {
    const cacheKey = cwd;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const context: CommandContext = {
      cwd,
      user: process.env.USER || 'unknown',
      shell: process.env.SHELL || '/bin/bash',
      git: await this.collectGitContext(cwd),
      project: await this.collectProjectContext(cwd),
      system: this.collectSystemContext(),
    };

    this.cache.set(cacheKey, context);
    return context;
  }

  private async collectGitContext(cwd: string): Promise<CommandContext['git']> {
    try {
      const isRepo = fs.existsSync(path.join(cwd, '.git'));
      if (!isRepo) {
      return {
        isRepo: false,
        currentBranch: '',
        isMainBranch: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        isPrivateRepo: false,
      };
      }

      const currentBranch = this.execGit('git branch --show-current', cwd) || 'unknown';
      const isMainBranch = ['main', 'master'].includes(currentBranch);
      const status = this.execGit('git status --porcelain', cwd);
      const hasUncommittedChanges = status.length > 0;
      const unpushed = this.execGit('git log @{u}..HEAD --oneline 2>/dev/null || true', cwd);
      const hasUnpushedCommits = unpushed.length > 0;

      return {
        isRepo: true,
        currentBranch,
        isMainBranch,
        hasUncommittedChanges,
        hasUnpushedCommits,
        isPrivateRepo: false,
      };
    } catch {
      return {
        isRepo: false,
        currentBranch: '',
        isMainBranch: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        isPrivateRepo: false,
      };
    }
  }

  private async collectProjectContext(cwd: string): Promise<CommandContext['project']> {
    const hasPackageJson = fs.existsSync(path.join(cwd, 'package.json'));
    const hasRequirements = fs.existsSync(path.join(cwd, 'requirements.txt'));
    const hasGoMod = fs.existsSync(path.join(cwd, 'go.mod'));

    let type: 'node' | 'python' | 'go' | 'unknown' = 'unknown';
    if (hasPackageJson) type = 'node';
    else if (hasRequirements) type = 'python';
    else if (hasGoMod) type = 'go';

    const hasDatabaseConfig = [
      'prisma/schema.prisma',
      'docker-compose.yml',
      'knexfile.js',
      'ormconfig.json',
    ].some(f => fs.existsSync(path.join(cwd, f)));

    return {
      type,
      hasPackageFiles: hasPackageJson || hasRequirements || hasGoMod,
      isProduction: process.env.NODE_ENV === 'production',
      hasDatabaseConfig,
    };
  }

  private collectSystemContext(): CommandContext['system'] {
    return {
      platform: process.platform,
      hasRoot: process.getuid?.() === 0 || false,
      networkConnected: true, // 简化处理
    };
  }

  private execGit(command: string, cwd: string): string {
    try {
      return execSync(command, { cwd, encoding: 'utf8', timeout: 5000 }).trim();
    } catch {
      return '';
    }
  }
}
