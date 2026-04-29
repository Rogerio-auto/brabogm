import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count, ilike, or, and, gte, lte, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { subscriptions, customers, eventLogs } from '../../database/schema';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async expireOverdueSubscriptions(options?: {
    source?: 'api' | 'n8n';
    reason?: string;
    triggeredBy?: string;
  }) {
    const now = new Date();
    const result = await this.db
      .update(subscriptions)
      .set({ status: 'expired', accessGranted: false, updatedAt: now })
      .where(
        and(
          eq(subscriptions.status, 'active'),
          lte(subscriptions.endDate, now),
        ),
      );

    const expiredCount = (result as { rowCount?: number })?.rowCount ?? 0;

    await this.db.insert(eventLogs).values({
      type: 'subscriptions.expire_overdue_sweep',
      source: options?.source ?? 'api',
      payload: {
        expiredCount,
        reason: options?.reason ?? 'manual_or_import',
        triggeredBy: options?.triggeredBy ?? 'system',
        executedAt: now.toISOString(),
      },
    });

    return {
      expiredCount,
      executedAt: now.toISOString(),
      source: options?.source ?? 'api',
      reason: options?.reason ?? 'manual_or_import',
    };
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit, search, status, customerId, dateFrom, dateTo } = params;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
          ilike(customers.document, `%${search}%`),
        )!,
      );
    }

    if (status) {
      conditions.push(eq(subscriptions.status, status));
    }

    if (customerId) {
      conditions.push(eq(subscriptions.customerId, customerId));
    }

    if (dateFrom) {
      conditions.push(gte(subscriptions.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(subscriptions.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseSelect = {
      id: subscriptions.id,
      customerId: subscriptions.customerId,
      productId: subscriptions.productId,
      status: subscriptions.status,
      accessType: subscriptions.accessType,
      accessGranted: subscriptions.accessGranted,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      trialEndDate: subscriptions.trialEndDate,
      revokedAt: subscriptions.revokedAt,
      cancelledAt: subscriptions.cancelledAt,
      amount: subscriptions.amount,
      currency: subscriptions.currency,
      billingCycle: subscriptions.billingCycle,
      externalId: subscriptions.externalId,
      metadata: subscriptions.metadata,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
      customerName: customers.name,
      customerEmail: customers.email,
      customerDocument: customers.document,
    };

    const joinedQuery = this.db
      .select(baseSelect)
      .from(subscriptions)
      .leftJoin(customers, eq(subscriptions.customerId, customers.id));

    const countQuery = this.db
      .select({ value: count() })
      .from(subscriptions)
      .leftJoin(customers, eq(subscriptions.customerId, customers.id));

    const dataQuery = where ? joinedQuery.where(where) : joinedQuery;
    const totalQuery = where ? countQuery.where(where) : countQuery;

    const [data, totalResult] = await Promise.all([
      dataQuery.orderBy(desc(subscriptions.createdAt)).limit(limit).offset(offset),
      totalQuery,
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
    const [subscription] = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!subscription) throw new NotFoundException(`Subscription ${id} not found`);
    return subscription;
  }

  async create(dto: CreateSubscriptionDto) {
    const [subscription] = await this.db
      .insert(subscriptions)
      .values({
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        trialEndDate: dto.trialEndDate ? new Date(dto.trialEndDate) : undefined,
      })
      .returning();
    return subscription;
  }

  async update(id: string, dto: UpdateSubscriptionDto) {
    await this.findOne(id);
    const updateData: Record<string, unknown> = { ...dto, updatedAt: new Date() };
    if (dto.startDate !== undefined) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);
    if (dto.trialEndDate !== undefined) updateData.trialEndDate = new Date(dto.trialEndDate);
    const [updated] = await this.db
      .update(subscriptions)
      .set(updateData)
      .where(eq(subscriptions.id, id))
      .returning();
    return updated;
  }
}
