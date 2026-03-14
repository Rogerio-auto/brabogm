import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count, ilike, or, and, gte, lte, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { customers } from '../../database/schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, limit, search, status, dateFrom, dateTo } = params;
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
      conditions.push(eq(customers.status, status));
    }

    if (dateFrom) {
      conditions.push(gte(customers.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(customers.createdAt, end));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = where
      ? this.db.select().from(customers).where(where)
      : this.db.select().from(customers);

    const countQuery = where
      ? this.db.select({ value: count() }).from(customers).where(where)
      : this.db.select({ value: count() }).from(customers);

    const [data, totalResult] = await Promise.all([
      baseQuery.orderBy(desc(customers.createdAt)).limit(limit).offset(offset),
      countQuery,
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
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const [customer] = await this.db.insert(customers).values(dto).returning();
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    const [updated] = await this.db
      .update(customers)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.db.delete(customers).where(eq(customers.id, id));
    return { message: 'Customer deleted successfully' };
  }
}
