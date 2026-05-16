import { Controller, Get, Put, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { LlmService } from './llm.service';
import { SqliteStorageService } from '../storage/sqlite-storage.service';

@Controller('api/v1/llm')
export class LlmController {
  constructor(
    private readonly llmService: LlmService,
    private readonly storage: SqliteStorageService,
  ) {}

  @Get('config')
  async getConfig() {
    const config = await this.storage.getLlmConfig();
    if (!config) {
      return { configured: false };
    }
    return {
      configured: true,
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKeyMasked: config.apiKey ? `${config.apiKey.slice(0, 6)}${'*'.repeat(12)}` : '',
      model: config.model,
      enabled: config.enabled,
    };
  }

  @Put('config')
  async saveConfig(@Body() body: {
    provider: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
    enabled: boolean;
  }) {
    if (!body.provider || !body.model) {
      throw new HttpException('provider and model are required', HttpStatus.BAD_REQUEST);
    }
    const existing = await this.storage.getLlmConfig();
    const apiKey = body.apiKey || existing?.apiKey || '';
    if (!apiKey) {
      throw new HttpException('apiKey is required for initial setup', HttpStatus.BAD_REQUEST);
    }
    await this.storage.saveLlmConfig({
      provider: body.provider,
      baseUrl: body.baseUrl || '',
      apiKey,
      model: body.model,
      enabled: body.enabled !== false,
    });
    return { success: true };
  }

  @Post('test')
  async testConnection() {
    const result = await this.llmService.testConnection();
    return result;
  }
}
