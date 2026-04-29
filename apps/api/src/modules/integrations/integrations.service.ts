import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private ensureValidN8nSecret(secret: string) {
    const expectedSecret = this.configService.get<string>('N8N_WEBHOOK_SECRET');

    if (expectedSecret && secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid n8n webhook secret');
    }
  }

  async ingestFromN8n(body: any, secret: string) {
    this.ensureValidN8nSecret(secret);

    this.logger.log(`Received data from n8n: ${JSON.stringify(body)}`);

    return { received: true, timestamp: new Date().toISOString() };
  }

  async cancelWrongProductSubscriptionsFromN8n(secret: string, body: { allowedProductName: string; dryRun?: boolean }) {
    this.ensureValidN8nSecret(secret);

    const result = await this.subscriptionsService.cancelSubscriptionsWithWrongProduct({
      allowedProductName: body.allowedProductName,
      dryRun: body.dryRun ?? false,
      triggeredBy: 'integrations.n8n',
    });

    this.logger.log(`Cancel wrong product subs via n8n: cancelled=${result.cancelled} dryRun=${result.dryRun}`);

    return result;
  }

  async expireOverdueSubscriptionsFromN8n(secret: string) {
    this.ensureValidN8nSecret(secret);

    const result = await this.subscriptionsService.expireOverdueSubscriptions({
      source: 'n8n',
      reason: 'n8n_cron',
      triggeredBy: 'integrations.n8n',
    });

    this.logger.log(`Expired overdue subscriptions via n8n cron: ${result.expiredCount}`);

    return result;
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

    this.logger.log(`[Webhook] Event: ${event} | URL resolved: ${url || 'NULL'}`);

    if (!url) {
      this.logger.warn(`[Webhook] No URL for event "${event}". Check env vars N8N_WEBHOOK_ADMIN_ACTION / N8N_WEBHOOK_NEW_LEAD`);
      return { triggered: false, reason: `No webhook URL for event: ${event}` };
    }

    try {
      const body = { ...payload, event };
      this.logger.log(`[Webhook] Sending POST to ${url} with body keys: ${Object.keys(body).join(', ')}`);
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-brabogm-secret': secret } : {}),
        },
        timeout: 10000,
      });

      this.logger.log(`[Webhook] SUCCESS event: ${event} -> ${url} (status ${response.status})`);
      return { triggered: true, status: response.status };
    } catch (error: any) {
      const msg = error.response
        ? `HTTP ${error.response.status}: ${JSON.stringify(error.response.data).slice(0, 200)}`
        : error.message;
      this.logger.error(`[Webhook] FAILED event: ${event} -> ${url} | Error: ${msg}`);
      return { triggered: false, error: msg };
    }
  }
}
