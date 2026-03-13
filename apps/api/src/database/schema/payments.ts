import { pgTable, uuid, varchar, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { subscriptions } from './subscriptions';

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
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
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
