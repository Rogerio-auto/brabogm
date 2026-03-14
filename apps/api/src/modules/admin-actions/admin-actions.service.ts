import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { adminActions } from '../../database/schema';
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
    const [action] = await this.db
      .insert(adminActions)
      .values({ ...dto, adminId, status: 'processing' })
      .returning();

    try {
      if (dto.type === 'trigger_n8n_workflow') {
        await this.integrationsService.triggerN8nWebhook('admin-action', {
          actionId: action.id,
          type: dto.type,
          payload: dto.payload,
          customerId: dto.customerId,
          subscriptionId: dto.subscriptionId,
        });
      }

      await this.db
        .update(adminActions)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(adminActions.id, action.id));

      return { ...action, status: 'completed' };
    } catch (error) {
      await this.db
        .update(adminActions)
        .set({ status: 'failed', result: { error: (error as Error).message }, updatedAt: new Date() })
        .where(eq(adminActions.id, action.id));

      return { ...action, status: 'failed' };
    }
  }
}
