import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, desc, count, ilike, or, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { affiliates, customers } from '../../database/schema';
import { CreateAffiliateDto, UpdateAffiliateDto } from './dto/affiliate.dto';

@Injectable()
export class AffiliatesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(affiliates.name, `%${search}%`),
          ilike(affiliates.email, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select({
          id: affiliates.id,
          name: affiliates.name,
          email: affiliates.email,
          metadata: affiliates.metadata,
          createdAt: affiliates.createdAt,
          customerCount: count(customers.id),
        })
        .from(affiliates)
        .leftJoin(customers, eq(customers.affiliateId, affiliates.id))
        .where(whereClause)
        .groupBy(affiliates.id)
        .orderBy(desc(affiliates.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(affiliates)
        .where(whereClause),
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
    const [affiliate] = await this.db
      .select()
      .from(affiliates)
      .where(eq(affiliates.id, id))
      .limit(1);
    if (!affiliate) throw new NotFoundException(`Affiliate ${id} not found`);
    return affiliate;
  }

  async create(dto: CreateAffiliateDto) {
    const [existing] = await this.db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.email, dto.email))
      .limit(1);
    if (existing) throw new ConflictException('Affiliate with this email already exists');

    const [affiliate] = await this.db
      .insert(affiliates)
      .values({
        name: dto.name,
        email: dto.email,
        metadata: dto.metadata || null,
      })
      .returning();
    return affiliate;
  }

  async update(id: string, dto: UpdateAffiliateDto) {
    await this.findOne(id);
    const values: Record<string, unknown> = {};
    if (dto.name !== undefined) values.name = dto.name;
    if (dto.email !== undefined) values.email = dto.email;
    if (dto.metadata !== undefined) values.metadata = dto.metadata;

    if (Object.keys(values).length === 0) return this.findOne(id);

    const [updated] = await this.db
      .update(affiliates)
      .set(values)
      .where(eq(affiliates.id, id))
      .returning();
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    // Check if there are linked customers
    const [linked] = await this.db
      .select({ value: count() })
      .from(customers)
      .where(eq(customers.affiliateId, id));
    if (linked?.value > 0) {
      throw new ConflictException(
        `Cannot delete affiliate with ${linked.value} linked customer(s). Remove the association first.`,
      );
    }
    await this.db.delete(affiliates).where(eq(affiliates.id, id));
    return { message: 'Affiliate deleted successfully' };
  }
}
