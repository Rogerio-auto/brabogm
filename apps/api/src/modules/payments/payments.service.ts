import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count, ilike, or, and, gte, lte, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { payments, customers } from '../../database/schema';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    method?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit, search, status, method, dateFrom, dateTo } = params;
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
      conditions.push(eq(payments.status, status));
    }

    if (method) {
      conditions.push(eq(payments.method, method));
    }

    if (dateFrom) {
      conditions.push(gte(payments.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(payments.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseSelect = {
      id: payments.id,
      subscriptionId: payments.subscriptionId,
      customerId: payments.customerId,
      type: payments.type,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      method: payments.method,
      externalId: payments.externalId,
      gatewayResponse: payments.gatewayResponse,
      paidAt: payments.paidAt,
      dueDate: payments.dueDate,
      metadata: payments.metadata,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
      customerName: customers.name,
      customerEmail: customers.email,
      customerDocument: customers.document,
    };

    const joinedQuery = this.db
      .select(baseSelect)
      .from(payments)
      .leftJoin(customers, eq(payments.customerId, customers.id));

    const countQuery = this.db
      .select({ value: count() })
      .from(payments)
      .leftJoin(customers, eq(payments.customerId, customers.id));

    const dataQuery = where ? joinedQuery.where(where) : joinedQuery;
    const totalQuery = where ? countQuery.where(where) : countQuery;

    const [data, totalResult] = await Promise.all([
      dataQuery.orderBy(desc(payments.createdAt)).limit(limit).offset(offset),
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
