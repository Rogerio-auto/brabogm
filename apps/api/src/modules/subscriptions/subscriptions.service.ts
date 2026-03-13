import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { subscriptions } from '../../database/schema';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(limit).offset(offset),
      this.db.select({ value: count() }).from(subscriptions),
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
    const [updated] = await this.db
      .update(subscriptions)
      .set({
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        trialEndDate: dto.trialEndDate ? new Date(dto.trialEndDate) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .returning();
    return updated;
  }
}
