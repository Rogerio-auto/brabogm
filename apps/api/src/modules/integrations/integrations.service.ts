import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private readonly configService: ConfigService) {}

  async ingestFromN8n(body: any, secret: string) {
    const expectedSecret = this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (expectedSecret && secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid n8n webhook secret');
    }

    this.logger.log(`Received data from n8n: ${JSON.stringify(body)}`);

    return { received: true, timestamp: new Date().toISOString() };
  }

  async triggerN8nWebhook(event: string, payload: any) {
    const n8nBaseUrl = this.configService.get<string>('N8N_BASE_URL');
    const secret = this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (!n8nBaseUrl) {
      this.logger.warn('N8N_BASE_URL not configured, skipping webhook trigger');
      return { triggered: false, reason: 'N8N_BASE_URL not configured' };
    }

    try {
      const response = await axios.post(
        `${n8nBaseUrl}/webhook/brabogm/${event}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { 'x-brabogm-secret': secret } : {}),
          },
          timeout: 10000,
        },
      );

      this.logger.log(`n8n webhook triggered for event: ${event}`);
      return { triggered: true, status: response.status };
    } catch (error) {
      this.logger.error(`Failed to trigger n8n webhook for event ${event}: ${(error as Error).message}`);
      return { triggered: false, error: (error as Error).message };
    }
  }
}
