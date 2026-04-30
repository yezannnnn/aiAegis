/**
 * Aegis Context Analyzer — 分析命令执行上下文
 *
 * 提供智能上下文感知，大幅降低误报率
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { CommandContext } from './types';

export class ContextAnalyzer {
  /**
   * 分析给定目录的上下文信息
   */
  async analyzeContext(cwd: string): Promise<CommandContext> {
    const context: CommandContext = {
      cwd,
      shell: process.env.SHELL || 'unknown',
      user: process.env.USER || process.env.USERNAME,
    };

    // 并发分析各个方面
    const [gitInfo, projectInfo, systemInfo] = await Promise.all([
      this.analyzeGitContext(cwd),
      this.analyzeProjectContext(cwd),
      this.analyzeSystemContext(),
    ]);

    context.git = gitInfo;
    context.project = projectInfo;
    context.system = systemInfo;

    return context;
  }

  /**
   * 分析 Git 上下文
   */
  private async analyzeGitContext(cwd: string) {
    try {
      // 检查是否为 git 仓库
      if (!fs.existsSync(path.join(cwd, '.git'))) {
        return { isRepo: false, currentBranch: '', isMainBranch: false, hasUncommittedChanges: false, hasUnpushedCommits: false, isPrivateRepo: false };
      }

      const gitInfo = {
        isRepo: true,
        currentBranch: '',
        isMainBranch: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
        remoteUrl: undefined as string | undefined,
        isPrivateRepo: false,
      };

      // 获取当前分支
      try {
        gitInfo.currentBranch = execSync('git branch --show-current', {
          cwd,
          encoding: 'utf8'
        }).trim();
      } catch {}

      // 判断是否为主分支
      gitInfo.isMainBranch = ['main', 'master', 'develop', 'production'].includes(gitInfo.currentBranch);

      // 检查是否有未提交的更改
      try {
        const status = execSync('git status --porcelain', {
          cwd,
          encoding: 'utf8'
        });
        gitInfo.hasUncommittedChanges = status.trim().length > 0;
      } catch {}

      // 检查是否有未推送的提交
      try {
        const ahead = execSync(`git rev-list --count origin/${gitInfo.currentBranch}..HEAD`, {
          cwd,
          encoding: 'utf8'
        });
        gitInfo.hasUnpushedCommits = parseInt(ahead.trim()) > 0;
      } catch {}

      // 获取远程 URL
      try {
        gitInfo.remoteUrl = execSync('git remote get-url origin', {
          cwd,
          encoding: 'utf8'
        }).trim();
        gitInfo.isPrivateRepo = !gitInfo.remoteUrl.includes('github.com') || gitInfo.remoteUrl.includes('@');
      } catch {}

      return gitInfo;
    } catch (error) {
      return { isRepo: false, currentBranch: '', isMainBranch: false, hasUncommittedChanges: false, hasUnpushedCommits: false, isPrivateRepo: false };
    }
  }

  /**
   * 分析项目上下文
   */
  private async analyzeProjectContext(cwd: string) {
    const projectInfo = {
      type: 'unknown' as 'node' | 'python' | 'go' | 'unknown',
      hasPackageFiles: false,
      isProduction: false,
      hasDatabaseConfig: false,
    };

    // 检测项目类型
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      projectInfo.type = 'node';
      projectInfo.hasPackageFiles = true;
    } else if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
      projectInfo.type = 'python';
      projectInfo.hasPackageFiles = true;
    } else if (fs.existsSync(path.join(cwd, 'go.mod'))) {
      projectInfo.type = 'go';
      projectInfo.hasPackageFiles = true;
    }

    // 检查是否为生产环境
    const productionIndicators = [
      '/production',
      '/prod',
      'NODE_ENV=production',
      'RAILS_ENV=production',
    ];

    projectInfo.isProduction = productionIndicators.some(indicator =>
      cwd.includes(indicator) || process.env.NODE_ENV === 'production'
    );

    // 检查数据库配置
    const dbConfigFiles = [
      '.env',
      'database.yml',
      'knexfile.js',
      'prisma/schema.prisma',
      'config/database.js',
    ];

    projectInfo.hasDatabaseConfig = dbConfigFiles.some(file =>
      fs.existsSync(path.join(cwd, file))
    );

    return projectInfo;
  }

  /**
   * 分析系统上下文
   */
  private async analyzeSystemContext() {
    const systemInfo = {
      platform: process.platform,
      hasRoot: process.getuid ? process.getuid() === 0 : false,
      networkConnected: true, // 简化处理，假设联网
    };

    return systemInfo;
  }

  /**
   * 智能风险评估：基于上下文的风险级别
   */
  assessContextualRisk(command: string, context: CommandContext): {
    riskMultiplier: number;
    contextWarnings: string[];
  } {
    let riskMultiplier = 1.0;
    const warnings: string[] = [];

    // Git 相关风险评估
    if (command.includes('git') && context.git?.isRepo) {
      if (context.git.isMainBranch) {
        riskMultiplier *= 2.0;
        warnings.push('操作目标是主分支');
      }

      if (context.git.hasUncommittedChanges && command.includes('reset --hard')) {
        riskMultiplier *= 1.5;
        warnings.push('存在未提交的更改，可能丢失');
      }

      if (context.git.hasUnpushedCommits && command.includes('push --force')) {
        riskMultiplier *= 1.8;
        warnings.push('将覆盖远程已有提交');
      }
    }

    // 生产环境风险
    if (context.project?.isProduction) {
      riskMultiplier *= 3.0;
      warnings.push('当前为生产环境');
    }

    // 数据库操作风险
    if (command.includes('mysql') || command.includes('psql')) {
      if (context.project?.hasDatabaseConfig) {
        riskMultiplier *= 1.5;
        warnings.push('检测到数据库配置文件');
      }
    }

    // Root 权限风险
    if (context.system?.hasRoot && (command.includes('rm') || command.includes('chmod'))) {
      riskMultiplier *= 2.5;
      warnings.push('以 root 权限执行文件操作');
    }

    return {
      riskMultiplier: Math.min(riskMultiplier, 5.0), // 最大5倍风险
      contextWarnings: warnings,
    };
  }

  /**
   * 生成安全建议
   */
  generateSafetyAdvice(command: string, context: CommandContext): string[] {
    const advice: string[] = [];

    // Git 安全建议
    if (command.includes('git push --force') && context.git?.isMainBranch) {
      advice.push('考虑使用 git push --force-with-lease 更安全');
      advice.push('建议先备份：git stash push -m "pre-force-push"');
    }

    if (command.includes('git reset --hard') && context.git?.hasUncommittedChanges) {
      advice.push('建议先保存更改：git stash');
    }

    // 数据库安全建议
    if (command.includes('DROP') || command.includes('delete')) {
      advice.push('执行前建议备份数据库');
      advice.push('考虑先在开发环境测试');
    }

    // 文件操作建议
    if (command.includes('rm -rf')) {
      advice.push('建议先检查目标目录内容');
      advice.push('考虑使用 trash 命令替代 rm');
    }

    return advice;
  }
}