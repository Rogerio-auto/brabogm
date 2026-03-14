import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { payments } from '../../database/schema';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(payments).orderBy(desc(payments.createdAt)).limit(limit).offset(offset),
      this.db.select({ value: count() }).from(payments),
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
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async create(dto: CreatePaymentDto) {
    const [payment] = await this.db
      .insert(payments)
      .values({
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      })
      .returning();
    return payment;
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    const paidAt = status === 'paid' ? new Date() : undefined;
    const [updated] = await this.db
      .update(payments)
      .set({ status, paidAt, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return updated;
  }
}
