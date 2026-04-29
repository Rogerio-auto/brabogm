import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const customerContacts = pgTable('customer_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 20 }).notNull(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  displayName: varchar('display_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  customerIdIdx: index('idx_customer_contacts_customer_id').on(table.customerId),
}));

export type CustomerContact = typeof customerContacts.$inferSelect;
export type NewCustomerContact = typeof customerContacts.$inferInsert;
