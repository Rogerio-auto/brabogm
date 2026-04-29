import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { eventLogs } from '../../database/schema';
import { CreateEventLogDto } from './dto/create-event-log.dto';

@Injectable()
export class EventLogsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: any) {}

  async findAll(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db.select().from(eventLogs).orderBy(desc(eventLogs.createdAt)).limit(limit).offset(offset),
      this.db.select({ value: count() }).from(eventLogs),
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
    const [log] = await this.db.select().from(eventLogs).where(eq(eventLogs.id, id)).limit(1);
    if (!log) throw new NotFoundException(`Event log ${id} not found`);
    return log;
  }

  async create(dto: CreateEventLogDto) {
    const [log] = await this.db.insert(eventLogs).values(dto).returning();
    return log;
  }
}
