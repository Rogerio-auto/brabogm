import { pgTable, uuid, varchar, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  planId: varchar('plan_id', { length: 255 }).notNull(),
  planName: varchar('plan_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  trialEndDate: timestamp('trial_end_date'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('BRL'),
  billingCycle: varchar('billing_cycle', { length: 50 }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
