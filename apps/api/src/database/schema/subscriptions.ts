import { pgTable, uuid, varchar, timestamp, numeric, jsonb, boolean } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { products } from './products';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  accessType: varchar('access_type', { length: 20 }).notNull().default('paid'),
  accessGranted: boolean('access_granted').notNull().default(false),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  trialEndDate: timestamp('trial_end_date'),
  revokedAt: timestamp('revoked_at'),
  cancelledAt: timestamp('cancelled_at'),
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
