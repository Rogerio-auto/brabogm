import { pgTable, uuid, varchar, timestamp, numeric, jsonb, index } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { subscriptions } from './subscriptions';

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  type: varchar('type', { length: 20 }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('BRL'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  method: varchar('method', { length: 50 }),
  externalId: varchar('external_id', { length: 255 }),
  gatewayResponse: jsonb('gateway_response'),
  paidAt: timestamp('paid_at'),
  dueDate: timestamp('due_date'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index('idx_payments_customer_id').on(table.customerId),
  subscriptionIdIdx: index('idx_payments_subscription_id').on(table.subscriptionId),
  statusIdx: index('idx_payments_status').on(table.status),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
