import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { customers } from '../../database/schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(customers).orderBy(desc(customers.createdAt)).limit(limit).offset(offset),
      this.db.select({ value: count() }).from(customers),
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
