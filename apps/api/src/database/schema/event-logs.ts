import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

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
});

export type EventLog = typeof eventLogs.$inferSelect;
export type NewEventLog = typeof eventLogs.$inferInsert;
