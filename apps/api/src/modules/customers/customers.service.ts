import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count, ilike, or, and, gte, lte, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { customers, customerContacts, subscriptions, products } from '../../database/schema';
import { CreateCustomerDto, ManualCreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { IntegrationsService } from '../integrations/integrations.service';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: any,
    private readonly integrationsService: IntegrationsService,
  ) {}

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

  async manualCreate(dto: ManualCreateCustomerDto) {
    // 1. Create customer
    const [customer] = await this.db.insert(customers).values({
      name: dto.name,
      email: dto.email,
      document: dto.document || null,
      affiliateId: dto.affiliateId || null,
    }).returning();

    // 2. Create contacts
    const contactsToInsert: Array<{ customerId: string; channel: string; identifier: string }> = [];
    if (dto.whatsapp) contactsToInsert.push({ customerId: customer.id, channel: 'whatsapp', identifier: dto.whatsapp });
    if (dto.discord) contactsToInsert.push({ customerId: customer.id, channel: 'discord', identifier: dto.discord });
    if (dto.telegram) contactsToInsert.push({ customerId: customer.id, channel: 'telegram', identifier: dto.telegram });

    if (contactsToInsert.length > 0) {
      await this.db.insert(customerContacts).values(contactsToInsert);
    }

    // 3. Create subscription
    const nextBilling = new Date(dto.nextBillingDate);
    const [subscription] = await this.db.insert(subscriptions).values({
      customerId: customer.id,
      productId: dto.productId,
      status: 'active',
      accessType: dto.accessType || 'manual',
      accessGranted: true,
      startDate: new Date(),
      endDate: nextBilling,
      amount: dto.amount,
      currency: 'BRL',
      billingCycle: dto.billingCycle,
    }).returning();

    // 4. Trigger webhook
    const webhookPayload: Record<string, unknown> = {
      event: 'manual_customer_created',
      customerId: customer.id,
      customerName: dto.name,
      customerEmail: dto.email,
      subscriptionId: subscription.id,
      productId: dto.productId,
      billingCycle: dto.billingCycle,
      amount: dto.amount,
      nextBillingDate: dto.nextBillingDate,
      accessType: dto.accessType || 'manual',
      notifyCustomer: dto.notifyCustomer ?? false,
    };
    if (dto.document) webhookPayload.customerDocument = dto.document;
    if (dto.whatsapp) webhookPayload.whatsapp = dto.whatsapp;
    if (dto.discord) webhookPayload.discord = dto.discord;
    if (dto.telegram) webhookPayload.telegram = dto.telegram;
    if (dto.affiliateId) webhookPayload.affiliateId = dto.affiliateId;

    await this.integrationsService.triggerN8nWebhook('manual_customer_created', webhookPayload);

    return { customer, subscription };
  }

  async listProducts() {
    return this.db.select().from(products).where(eq(products.isActive, true));
  }
}
