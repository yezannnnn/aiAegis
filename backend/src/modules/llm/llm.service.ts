import { Injectable } from '@nestjs/common';
import { SqliteStorageService } from '../storage/sqlite-storage.service';

@Injectable()
export class LlmService {
  constructor(private readonly storage: SqliteStorageService) {}

  async getConfig() {
    return this.storage.getLlmConfig();
  }

  async isConfigured(): Promise<boolean> {
    const config = await this.storage.getLlmConfig();
    return !!(config?.enabled && config?.apiKey);
  }

  async chat(prompt: string): Promise<string> {
    const config = await this.storage.getLlmConfig();
    if (!config?.enabled || !config?.apiKey) {
      throw new Error('LLM not configured');
    }

    if (config.provider === 'anthropic') {
      return this.callAnthropic(config, prompt);
    }
    return this.callOpenAICompat(config, prompt);
  }

  private async callOpenAICompat(
    config: { baseUrl: string; apiKey: string; model: string },
    prompt: string,
  ): Promise<string> {
    const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async callAnthropic(
    config: { apiKey: string; model: string },
    prompt: string,
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }
    const data: any = await res.json();
    return data.content?.[0]?.text || '';
  }

  async testConnection(): Promise<{ ok: boolean; model: string; latency: number; error?: string }> {
    const start = Date.now();
    try {
      const config = await this.storage.getLlmConfig();
      if (!config?.apiKey) throw new Error('No API key configured');
      const result = await this.chat('Reply with the single word: OK');
      return { ok: true, model: config.model, latency: Date.now() - start };
    } catch (e: any) {
      return { ok: false, model: '', latency: Date.now() - start, error: e.message };
    }
  }

  async suggestVariants(opts: {
    description: string;
    action: string;
    binary: string;
    subcommands: string[];
    args: string[];
    flags: string[];
    example: string;
  }): Promise<string[]> {
    const { description, action, binary, subcommands, args, flags, example } = opts;
    const prompt = `You are a security rule testing assistant for Aegis CLI monitor.

Given a security rule that intercepts commands, generate variant commands that should also trigger this rule.

Rule:
- Description: ${description || '(none)'}
- Action: ${action}
- Binary: ${binary}
- Subcommands: ${subcommands.join(', ') || '(none)'}
- Arguments: ${args.join(', ') || '(none)'}
- Flags: ${flags.join(', ') || '(none)'}
- Example: ${example || '(none)'}

Generate 8 realistic variant commands that achieve the same effect using different flags, syntax, equivalent tools, or common user mistakes.

Return ONLY a JSON array of strings, no explanation, no markdown:
["cmd1", "cmd2", ...]`;

    const raw = await this.chat(prompt);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const variants = JSON.parse(match[0]);
      return Array.isArray(variants) ? variants.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
}
