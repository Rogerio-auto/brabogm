import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrations (n8n)')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post('n8n/ingest')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ingest data from n8n (no auth required, uses secret header)' })
  async ingestFromN8n(
    @Body() body: any,
    @Headers('x-n8n-secret') secret: string,
  ) {
    return this.integrationsService.ingestFromN8n(body, secret);
  }

  @Post('n8n/trigger')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger an n8n workflow webhook' })
  async triggerN8n(@Body() body: { event: string; payload: any }) {
    return this.integrationsService.triggerN8nWebhook(body.event, body.payload);
  }

  @Post('n8n/subscriptions/expire-overdue')
  @HttpCode(200)
  @ApiOperation({ summary: 'Expire overdue subscriptions when triggered by n8n cron' })
  async expireOverdueSubscriptions(@Headers('x-n8n-secret') secret: string) {
    return this.integrationsService.expireOverdueSubscriptionsFromN8n(secret);
  }
}
