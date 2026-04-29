import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { affiliates } from './affiliates';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  document: varchar('document', { length: 50 }),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  affiliateId: uuid('affiliate_id').references(() => affiliates.id),
  externalId: varchar('external_id', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  affiliateIdIdx: index('idx_customers_affiliate_id').on(table.affiliateId),
}));

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
