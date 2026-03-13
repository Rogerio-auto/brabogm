import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const eventLogs = pgTable('event_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 100 }).notNull(),
  customerId: uuid('customer_id'),
  subscriptionId: uuid('subscription_id'),
  paymentId: uuid('payment_id'),
  source: varchar('source', { length: 50 }).notNull().default('api'),
  payload: jsonb('payload'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index('idx_event_logs_customer_id').on(table.customerId),
  typeIdx: index('idx_event_logs_type').on(table.type),
}));

export type EventLog = typeof eventLogs.$inferSelect;
export type NewEventLog = typeof eventLogs.$inferInsert;
