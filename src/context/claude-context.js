#!/usr/bin/env node
/**
 * Claude Code上下文获取模块
 * 提取真实的Agent身份、对话历史、任务状态等信息
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Claude Code数据路径
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const HISTORY_FILE = path.join(CLAUDE_HOME, 'history.jsonl');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');
const TEMP_DIR = '/tmp/claude-501';

/**
 * AI模型来源类型映射
 */
const AI_MODEL_TYPES = {
  'hermes': { name: 'Hermes', type: 'Language Model', icon: '🧠', provider: 'Meta/Nous Research' },
  'openclaw': { name: 'OpenClaw', type: 'Code Assistant', icon: '🦾', provider: 'OpenClaw Project' },
  'claude': { name: 'Claude', type: 'Anthropic AI', icon: '🤖', provider: 'Anthropic' },
  'gpt': { name: 'GPT', type: 'OpenAI Model', icon: '⚡', provider: 'OpenAI' },
  'gemini': { name: 'Gemini', type: 'Google AI', icon: '💎', provider: 'Google' },
  'kimi': { name: 'Kimi', type: 'Moonshot AI', icon: '🌙', provider: 'Moonshot AI' },
  'unknown': { name: 'Unknown AI', type: 'Unknown', icon: '❓', provider: 'Unknown' }
};

/**
 * 从环境和进程信息检测AI模型来源
 * @param {string} projectPath - 项目路径
 * @returns {string} AI模型类型
 */
function detectAIModelFromEnvironment(projectPath) {
  // 检查环境变量和进程信息
  const env = process.env;
  const processName = process.title || '';
  const cwd = process.cwd() || '';

  // 检查Claude Code相关标识
  if (env.CLAUDE_CODE_VERSION || env.ANTHROPIC_API_KEY || processName.includes('claude')) {
    return 'claude';
  }

  // 检查Hermes相关标识
  if (env.HERMES_MODEL || env.NOUS_RESEARCH || projectPath?.includes('hermes')) {
    return 'hermes';
  }

  // 检查OpenClaw相关标识
  if (env.OPENCLAW_API || env.OPENCLAW_MODEL || projectPath?.includes('openclaw')) {
    return 'openclaw';
  }

  // 检查OpenAI GPT相关标识
  if (env.OPENAI_API_KEY || env.GPT_MODEL || processName.includes('gpt')) {
    return 'gpt';
  }

  // 检查Google Gemini相关标识
  if (env.GOOGLE_AI_KEY || env.GEMINI_MODEL || processName.includes('gemini')) {
    return 'gemini';
  }

  // 检查Kimi相关标识
  if (env.MOONSHOT_API_KEY || env.KIMI_MODEL || processName.includes('kimi')) {
    return 'kimi';
  }

  // 从用户代理或命令行参数检测
  const userAgent = env.HTTP_USER_AGENT || '';
  if (userAgent.includes('hermes')) return 'hermes';
  if (userAgent.includes('openclaw')) return 'openclaw';
  if (userAgent.includes('claude')) return 'claude';

  return 'unknown';
}

/**
 * 获取最近的用户输入历史
 * @param {number} limit - 获取数量限制
 * @returns {Array} 用户输入历史
 */
function getRecentUserInputs(limit = 10) {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return [];
    }

    const content = fs.readFileSync(HISTORY_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    const recentInputs = [];
    const processedLines = lines.slice(-limit * 2); // 多读一些以确保有足够的用户输入

    for (const line of processedLines.reverse()) {
      try {
        const entry = JSON.parse(line);
        if (entry.display && entry.timestamp) {
          recentInputs.push({
            text: entry.display,
            timestamp: new Date(entry.timestamp),
            project: entry.project,
            sessionId: entry.sessionId
          });

          if (recentInputs.length >= limit) break;
        }
      } catch (e) {
        // 跳过无效的JSON行
      }
    }

    return recentInputs.reverse(); // 恢复时间顺序
  } catch (error) {
    console.error('获取用户输入历史失败:', error);
    return [];
  }
}

/**
 * 获取当前活跃的Claude会话信息
 * @returns {Object} 会话信息
 */
function getCurrentSession() {
  try {
    const recentInputs = getRecentUserInputs(1);
    if (recentInputs.length === 0) {
      return null;
    }

    const latest = recentInputs[0];
    return {
      sessionId: latest.sessionId,
      project: latest.project,
      agent: detectAgentFromPath(latest.project),
      lastActivity: latest.timestamp
    };
  } catch (error) {
    console.error('获取当前会话失败:', error);
    return null;
  }
}

/**
 * 获取指定AI模型的执行上下文
 * @param {string} modelType - AI模型类型
 * @param {string} sessionId - 会话ID
 * @returns {Object} 执行上下文
 */
function getAIModelContext(modelType, sessionId) {
  try {
    // 构建任务目录路径
    const agentProjectPath = `/Users/${os.userInfo().username}/Desktop/yezannnnn/aiGroup/${agentType}`;
    const taskDir = path.join(TEMP_DIR, `-Users-${os.userInfo().username}-Desktop-yezannnnn-aiGroup-${agentType}`, sessionId, 'tasks');

    const context = {
      aiModel: AI_MODEL_TYPES[modelType] || { name: modelType, type: '未知', icon: '❓', provider: 'Unknown' },
      currentTask: 'Unknown',
      model: modelType,
      tokenUsage: 0,
      activeTasks: []
    };

    // 读取任务文件
    if (fs.existsSync(taskDir)) {
      const taskFiles = fs.readdirSync(taskDir)
        .filter(file => file.endsWith('.output'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(taskDir, a));
          const statB = fs.statSync(path.join(taskDir, b));
          return statB.mtime - statA.mtime;
        });

      // 分析最近的任务文件
      for (const taskFile of taskFiles.slice(0, 3)) {
        try {
          const taskContent = fs.readFileSync(path.join(taskDir, taskFile), 'utf8');
          const lines = taskContent.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const task = JSON.parse(line);
              if (task.message && task.message.role === 'user') {
                context.currentTask = inferTaskFromMessage(task.message.content);
                break;
              }
              if (task.message && task.message.model) {
                context.model = task.message.model;
              }
            } catch (e) {
              // 跳过无效的JSON
            }
          }
        } catch (error) {
          // 跳过无法读取的文件
        }
      }
    }

    return context;
  } catch (error) {
    console.error(`获取${agentType} Agent任务上下文失败:`, error);
    return {
      agent: AGENT_TYPES[agentType] || { name: agentType, role: '未知', icon: '❓' },
      currentTask: 'Error loading context',
      model: 'Unknown',
      tokenUsage: 0,
      activeTasks: []
    };
  }
}

/**
 * 从消息内容推断任务类型
 * @param {string|Array} content - 消息内容
 * @returns {string} 任务描述
 */
function inferTaskFromMessage(content) {
  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content.map(item => item.text || '').join(' ');
  }

  text = text.toLowerCase();

  // 任务类型推断
  if (text.includes('ui') || text.includes('design') || text.includes('界面')) {
    return 'UI/UX 设计任务';
  }
  if (text.includes('test') || text.includes('测试') || text.includes('bug')) {
    return 'QA 测试任务';
  }
  if (text.includes('api') || text.includes('backend') || text.includes('数据库')) {
    return '后端开发任务';
  }
  if (text.includes('project') || text.includes('plan') || text.includes('管理')) {
    return '项目管理任务';
  }
  if (text.includes('code') || text.includes('开发') || text.includes('implementation')) {
    return '代码开发任务';
  }

  return text.length > 50 ? text.substring(0, 50) + '...' : text;
}

/**
 * 分析命令意图
 * @param {string} command - 执行的命令
 * @param {Object} context - 上下文信息
 * @returns {string} 意图描述
 */
function analyzeCommandIntent(command, context) {
  const userInputs = getRecentUserInputs(5);
  const recentUserText = userInputs.map(input => input.text).join(' ').toLowerCase();

  // 基于用户输入和命令的意图分析
  if (command.includes('ui-ux-pro-max')) {
    return `使用 ${context.agent.name} 的UI设计技能进行界面重设计`;
  }

  if (command.includes('node') && command.includes('monitor')) {
    return `${context.agent.name} 启动监控界面服务`;
  }

  if (command.includes('git') && command.includes('push')) {
    return `${context.agent.name} 推送代码变更到远程仓库`;
  }

  if (command.includes('rm -rf')) {
    return `${context.agent.name} 执行危险的文件删除操作`;
  }

  if (command.includes('npm') || command.includes('yarn')) {
    return `${context.agent.name} 管理项目依赖包`;
  }

  // 如果没有特定模式，基于Agent类型推断
  const agentType = context.agent.name.toLowerCase();
  if (agentType === 'jarvis') {
    return `Jarvis 执行开发相关命令: ${command.split(' ')[0]}`;
  } else if (agentType === 'max') {
    return `Max 执行项目管理命令: ${command.split(' ')[0]}`;
  } else if (agentType === 'ella') {
    return `Ella 执行设计相关命令: ${command.split(' ')[0]}`;
  } else if (agentType === 'kyle') {
    return `Kyle 执行测试相关命令: ${command.split(' ')[0]}`;
  }

  return `执行系统命令: ${command.split(' ')[0]}`;
}

/**
 * 获取所有活跃Agent的状态
 * @returns {Array} 所有Agent状态
 */
function getAllAgentsStatus() {
  const currentSession = getCurrentSession();
  const agents = [];

  for (const [agentType, agentInfo] of Object.entries(AGENT_TYPES)) {
    const context = currentSession ?
      getAgentTaskContext(agentType, currentSession.sessionId) :
      { agent: agentInfo, currentTask: 'Inactive', model: 'N/A', tokenUsage: 0 };

    const isActive = currentSession && currentSession.agent === agentType;

    agents.push({
      type: agentType,
      name: agentInfo.name,
      role: agentInfo.role,
      icon: agentInfo.icon,
      isActive,
      currentTask: context.currentTask,
      model: context.model,
      lastActivity: isActive ? currentSession.lastActivity : null
    });
  }

  return agents;
}

module.exports = {
  detectAIModelFromEnvironment,
  getRecentUserInputs,
  getCurrentSession,
  getAIModelContext,
  analyzeCommandIntent,
  getAllAgentsStatus,
  AI_MODEL_TYPES
};