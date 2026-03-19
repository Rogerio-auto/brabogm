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

  private getWebhookUrl(event: string): string | null {
    // Map event to its env variable
    const envMap: Record<string, string> = {
      manual_customer_created: 'N8N_WEBHOOK_NEW_LEAD',
      // All admin actions go to the admin-action webhook
      cancel_subscription: 'N8N_WEBHOOK_ADMIN_ACTION',
      reactivate_subscription: 'N8N_WEBHOOK_ADMIN_ACTION',
      extend_subscription: 'N8N_WEBHOOK_ADMIN_ACTION',
      refund_payment: 'N8N_WEBHOOK_ADMIN_ACTION',
      block_customer: 'N8N_WEBHOOK_ADMIN_ACTION',
      unblock_customer: 'N8N_WEBHOOK_ADMIN_ACTION',
      trigger_n8n_workflow: 'N8N_WEBHOOK_ADMIN_ACTION',
      manual_renewal: 'N8N_WEBHOOK_ADMIN_ACTION',
      change_plan: 'N8N_WEBHOOK_ADMIN_ACTION',
      send_notification: 'N8N_WEBHOOK_ADMIN_ACTION',
    };

    const envKey = envMap[event] || 'N8N_WEBHOOK_ADMIN_ACTION';
    return this.configService.get<string>(envKey) || null;
  }

  async triggerN8nWebhook(event: string, payload: any) {
    const url = this.getWebhookUrl(event);
    const secret = this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (!url) {
      this.logger.warn(`No webhook URL configured for event: ${event}`);
      return { triggered: false, reason: `No webhook URL for event: ${event}` };
    }

    try {
      const body = { ...payload, event };
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-brabogm-secret': secret } : {}),
        },
        timeout: 10000,
      });

      this.logger.log(`n8n webhook triggered for event: ${event} -> ${url}`);
      return { triggered: true, status: response.status };
    } catch (error) {
      this.logger.error(`Failed to trigger n8n webhook for event ${event}: ${(error as Error).message}`);
      return { triggered: false, error: (error as Error).message };
    }
  }
}
