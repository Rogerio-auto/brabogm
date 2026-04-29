import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { adminActions, customers } from '../../database/schema';
import { IntegrationsService } from '../integrations/integrations.service';
import { CreateAdminActionDto } from './dto/create-admin-action.dto';

@Injectable()
export class AdminActionsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: any,
    private readonly integrationsService: IntegrationsService,
  ) {}

  async findAll(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(adminActions).orderBy(desc(adminActions.createdAt)).limit(limit).offset(offset),
      this.db.select({ value: count() }).from(adminActions),
    ]);

    const total = totalResult[0]?.value ?? 0;

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const [action] = await this.db.select().from(adminActions).where(eq(adminActions.id, id)).limit(1);
    if (!action) throw new Error(`Admin action ${id} not found`);
    return action;
  }

  async create(dto: CreateAdminActionDto, adminId: string) {
    const values = {
      type: dto.type,
      adminId,
      status: 'processing' as const,
      customerId: dto.customerId || null,
      subscriptionId: dto.subscriptionId || null,
      paymentId: dto.paymentId || null,
      payload: dto.payload || null,
      notes: dto.notes || null,
    };

    const [action] = await this.db
      .insert(adminActions)
      .values(values)
      .returning();

    try {
      const webhookPayload: Record<string, unknown> = {
        actionId: action.id,
        type: dto.type,
      };
      if (dto.customerId) {
        webhookPayload.customerId = dto.customerId;
        const [customer] = await this.db
          .select({ name: customers.name, email: customers.email, document: customers.document })
          .from(customers)
          .where(eq(customers.id, dto.customerId))
          .limit(1);
        if (customer) {
          webhookPayload.customerName = customer.name;
          webhookPayload.customerEmail = customer.email;
          if (customer.document) webhookPayload.customerDocument = customer.document;
        }
      }
      if (dto.subscriptionId) webhookPayload.subscriptionId = dto.subscriptionId;
      if (dto.paymentId) webhookPayload.paymentId = dto.paymentId;
      if (dto.payload) webhookPayload.payload = dto.payload;
      if (dto.notes) webhookPayload.notes = dto.notes;

      const webhookResult = await this.integrationsService.triggerN8nWebhook(dto.type, webhookPayload);

      if (webhookResult.triggered) {
        await this.db
          .update(adminActions)
          .set({ status: 'completed', result: webhookResult, updatedAt: new Date() })
          .where(eq(adminActions.id, action.id));
        return { ...action, status: 'completed' };
      } else {
        await this.db
          .update(adminActions)
          .set({ status: 'failed', result: webhookResult, updatedAt: new Date() })
          .where(eq(adminActions.id, action.id));
        return { ...action, status: 'failed' };
      }
    } catch (error) {
      await this.db
        .update(adminActions)
        .set({ status: 'failed', result: { error: (error as Error).message }, updatedAt: new Date() })
        .where(eq(adminActions.id, action.id));

      return { ...action, status: 'failed' };
    }
  }
}
