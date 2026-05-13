const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('cross-spawn');
const chalk = require('chalk');
const ora = require('ora');
const os = require('os');

const AEGIS_PROMPT_HOOK = `Check if this bash command is safe to run: $ARGUMENTS

If SAFE (ls, cat, git read ops, npm install, echo, grep, find, mkdir, build tools, test runners), respond with: {"ok": true}

If DANGEROUS (rm -rf, shutil.rmtree, DROP TABLE, git push --force to main/master, format disk, shred, dd, truncate), respond with: {"ok": false, "reason": "brief reason"}

Respond with ONLY the JSON. No other text.`;

class AegisSetupUtils {
  constructor() {
    this.homeDir = os.homedir();
    this.aegisDir = path.join(this.homeDir, '.aegis');
    this.userRulesDir = path.join(this.homeDir, '.aegis', 'rules');
    this.claudeSettingsFile = path.join(this.homeDir, '.claude', 'settings.json');
    this.packageDir = path.dirname(__dirname);
    this.backendDir = path.join(this.packageDir, 'backend');
  }

  // ============================================================
  // Create directory structure
  // ============================================================
  async createDirectories() {
    const spinner = ora('Creating config directories...').start();
    try {
      await fs.ensureDir(this.aegisDir);
      await fs.ensureDir(this.userRulesDir);
      await fs.ensureDir(path.join(this.aegisDir, 'logs'));
      await fs.ensureDir(path.join(this.aegisDir, 'backup'));
      spinner.succeed(`Config directories created: ${this.aegisDir}`);
    } catch (error) {
      spinner.fail('Failed to create config directories');
      throw error;
    }
  }

  // ============================================================
  // Copy hook files + example rules
  // ============================================================
  async copySystemFiles() {
    const spinner = ora('Copying system files...').start();
    try {
      const hookSrc = path.join(this.packageDir, 'hooks', 'claude-code', 'universal-hook-v2.js');
      const hookDest = path.join(this.aegisDir, 'universal-hook.js');

      if (await fs.pathExists(hookSrc)) {
        await fs.copy(hookSrc, hookDest);
      } else {
        throw new Error(`Hook file not found: ${hookSrc}`);
      }

      const postHookSrc = path.join(this.packageDir, 'hooks', 'claude-code', 'post-tool-use-handler.js');
      const postHookDest = path.join(this.aegisDir, 'post-tool-use-handler.js');
      if (await fs.pathExists(postHookSrc)) {
        await fs.copy(postHookSrc, postHookDest);
      }

      const hookConfigDest = path.join(this.aegisDir, 'config.json');
      if (!await fs.pathExists(hookConfigDest)) {
        await fs.writeJson(hookConfigDest, { ports: { webInterface: 3001 } }, { spaces: 2 });
      }

      const exampleSrc = path.join(this.backendDir, 'dist', 'rules', 'example-custom.yaml');
      const exampleDest = path.join(this.userRulesDir, 'example-custom.yaml');
      if (await fs.pathExists(exampleSrc) && !await fs.pathExists(exampleDest)) {
        await fs.copy(exampleSrc, exampleDest);
      }

      spinner.succeed('System files copied');
    } catch (error) {
      spinner.fail('Failed to copy system files: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // Configure Claude Code Hook
  // ============================================================
  async setupClaudeCodeHook() {
    const spinner = ora('Configuring Claude Code Hook...').start();
    try {
      await fs.ensureDir(path.dirname(this.claudeSettingsFile));

      let settings = {};
      if (await fs.pathExists(this.claudeSettingsFile)) {
        try {
          settings = await fs.readJson(this.claudeSettingsFile);
          const backupFile = path.join(this.aegisDir, 'backup', `claude-settings-${Date.now()}.json`);
          await fs.writeJson(backupFile, settings, { spaces: 2 });
        } catch {
          settings = {};
        }
      }

      const hookPath = path.join(this.aegisDir, 'universal-hook.js');
      const postHookPath = path.join(this.aegisDir, 'post-tool-use-handler.js');

      settings.hooks = settings.hooks || {};
      settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
      settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];

      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        h => !JSON.stringify(h).includes('.aegis')
      );
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
        h => !JSON.stringify(h).includes('.aegis')
      );

      settings.hooks.PreToolUse.push({
        matcher: 'Bash',
        hooks: [{
          type: 'command',
          command: `node "${hookPath}"`,
          timeout: 120
        }]
      });

      settings.hooks.PostToolUse.push({
        matcher: 'Bash',
        hooks: [{
          type: 'command',
          command: `node "${postHookPath}"`,
          timeout: 10
        }]
      });

      settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
        h => !(JSON.stringify(h).includes('"type":"prompt"') && JSON.stringify(h).includes('Aegis'))
      );
      settings.hooks.PreToolUse.push({
        matcher: 'Bash',
        hooks: [{
          type: 'prompt',
          prompt: AEGIS_PROMPT_HOOK,
          model: 'claude-haiku-4-5-20251001',
          timeout: 8,
          statusMessage: '🛡️ Aegis AI analyzing...',
        }]
      });

      await fs.writeJson(this.claudeSettingsFile, settings, { spaces: 2 });
      spinner.succeed('Claude Code Hook configured');

      return {
        settingsFile: this.claudeSettingsFile,
        hookPath,
        backupCreated: true,
      };
    } catch (error) {
      spinner.fail('Hook configuration failed: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // Configure Hermes Plugin Hook
  // ============================================================
  async setupHermesHook() {
    const spinner = ora('Configuring Hermes Plugin Hook...').start();
    try {
      const hermesPluginDir = path.join(this.homeDir, '.hermes', 'plugins', 'aegis');
      await fs.ensureDir(hermesPluginDir);

      // 1. Copy plugin.py as __init__.py
      const pluginSrc = path.join(this.packageDir, 'hooks', 'hermes', 'plugin.py');
      const initDest = path.join(hermesPluginDir, '__init__.py');

      if (await fs.pathExists(pluginSrc)) {
        await fs.copy(pluginSrc, initDest, { overwrite: true });
      } else {
        throw new Error(`Hermes Plugin file not found: ${pluginSrc}`);
      }

      // 2. Create plugin.yaml (plugin metadata)
      const yamlContent = `name: aegis
description: Aegis AI Security Monitor - intercept dangerous terminal commands
version: 2.0.0
hooks:
  - pre_tool_call
  - pre_llm_call
`;
      const yamlDest = path.join(hermesPluginDir, 'plugin.yaml');
      await fs.writeFile(yamlDest, yamlContent, 'utf8');

      // 3. Auto-enable plugin
      try {
        await this.runCommand('hermes', ['plugins', 'enable', 'aegis'], {
          captureOutput: true,
        });
        spinner.succeed('Hermes Plugin Hook configured and enabled');
      } catch (enableError) {
        spinner.warn('Hermes Plugin installed, but auto-enable failed');
        console.log(chalk.yellow('   Run manually: hermes plugins enable aegis'));
      }

      return {
        pluginDir: hermesPluginDir,
        pluginPath: initDest,
        enabled: true,
        restartRequired: true,
      };
    } catch (error) {
      spinner.fail('Hermes Plugin Hook configuration failed: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // Install backend runtime dependencies
  // ============================================================
  async installDependencies() {
    const spinner = ora('Installing backend runtime dependencies (sqlite3, etc.)...').start();
    try {
      await this.runCommand('npm', ['install', '--production', '--no-audit', '--no-fund', '--legacy-peer-deps'], {
        cwd: this.backendDir,
        captureOutput: false,
      });
      spinner.succeed('Backend dependencies installed');
    } catch (error) {
      spinner.fail('Backend dependency installation failed: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // Create system config
  // ============================================================
  async createSystemConfig(options = {}) {
    const port = parseInt(options.port || '3001');
    const config = {
      version: '2.0.0',
      setupDate: new Date().toISOString(),
      ports: {
        webInterface: port,
      },
      backend: { port, host: 'localhost' },
      features: {
        claudeHookEnabled: true,
        realTimeMonitoring: true,
        approvalSystem: true,
      },
      directories: {
        home: this.aegisDir,
        rules: this.userRulesDir,
        logs: path.join(this.aegisDir, 'logs'),
      },
    };
    await fs.writeJson(path.join(this.aegisDir, 'config.json'), config, { spaces: 2 });
    return config;
  }

  // ============================================================
  // Validate installation
  // ============================================================
  async validateInstallation() {
    const spinner = ora('Validating installation...').start();
    try {
      const hookFile = path.join(this.aegisDir, 'universal-hook.js');
      const distMain = path.join(this.backendDir, 'dist', 'main.js');

      if (!await fs.pathExists(hookFile)) {
        throw new Error(`Hook file not found: ${hookFile}`);
      }
      if (!await fs.pathExists(distMain)) {
        throw new Error(`Backend build artifact not found: ${distMain} (run aegis build first)`);
      }

      spinner.succeed('Installation validated');
    } catch (error) {
      spinner.fail('Validation failed: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // Show installation summary
  // ============================================================
  showInstallationSummary(config, hookInfo, hermesHookInfo) {
    const port = config.ports?.webInterface || config.backend?.port || 3001;
    console.log('');
    console.log(chalk.green('🎉 Aegis Security Monitor setup complete!'));
    console.log('');
    console.log(chalk.cyan('📍 Configuration:'));
    console.log(`   Config dir:    ${chalk.yellow(this.aegisDir)}`);
    console.log(`   User rules:    ${chalk.yellow(this.userRulesDir)}`);
    if (hookInfo) {
      console.log(`   Claude Hook:   ${chalk.yellow(hookInfo.hookPath)}`);
    }
    if (hermesHookInfo) {
      console.log(`   Hermes Plugin: ${chalk.yellow(hermesHookInfo.pluginPath)}`);
    }
    console.log('');
    console.log(chalk.cyan('📋 Next steps:'));
    console.log(`   1. Run  ${chalk.green('aegis start')}`);
    console.log(`   2. Open ${chalk.green(`http://localhost:${port}`)}`);
    console.log(`   3. Run  ${chalk.green('aegis rules new my-rules')} to create custom rules`);
    console.log('');
    if (hookInfo?.backupCreated) {
      console.log(chalk.gray('💾 Original Claude settings backed up to ~/.aegis/backup/'));
    }
    if (hermesHookInfo?.restartRequired) {
      console.log(chalk.yellow('⚠️  Hermes Plugin updated — restart Hermes CLI to apply changes'));
    }
  }

  // ============================================================
  // Reset
  // ============================================================
  async resetInstallation() {
    const spinner = ora('Resetting configuration...').start();
    try {
      if (await fs.pathExists(this.aegisDir)) {
        await fs.remove(this.aegisDir);
      }
      if (await fs.pathExists(this.claudeSettingsFile)) {
        const settings = await fs.readJson(this.claudeSettingsFile);
        if (settings.hooks?.PreToolUse) {
          settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
            h => !JSON.stringify(h).includes('.aegis')
          );
        }
        await fs.writeJson(this.claudeSettingsFile, settings, { spaces: 2 });
      }
      spinner.succeed('Configuration reset');
    } catch (error) {
      spinner.fail('Reset failed');
      throw error;
    }
  }

  // ============================================================
  // Helper: run command
  // ============================================================
  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: options.captureOutput === false ? 'inherit' : 'pipe',
        cwd: options.cwd,
      });

      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', d => { stderr += d.toString(); });
      }

      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `exit code ${code}`));
      });
      child.on('error', reject);
    });
  }
}

module.exports = AegisSetupUtils;
