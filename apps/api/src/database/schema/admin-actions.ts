import { pgTable, uuid, varchar, timestamp, jsonb, text } from 'drizzle-orm/pg-core';

export const adminActions = pgTable('admin_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 100 }).notNull(),
  adminId: uuid('admin_id').notNull(),
  customerId: uuid('customer_id'),
  subscriptionId: uuid('subscription_id'),
  paymentId: uuid('payment_id'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  payload: jsonb('payload'),
  result: jsonb('result'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AdminAction = typeof adminActions.$inferSelect;
export type NewAdminAction = typeof adminActions.$inferInsert;
