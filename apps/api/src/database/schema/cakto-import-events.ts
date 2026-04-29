import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { caktoImports } from './cakto-imports';

export const caktoImportEvents = pgTable('cakto_import_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  importId: uuid('import_id').references(() => caktoImports.id),
  saleId: varchar('sale_id', { length: 255 }).notNull().unique(),
  action: varchar('action', { length: 50 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('processed'),
  customerEmail: varchar('customer_email', { length: 255 }),
  productName: varchar('product_name', { length: 255 }),
  payload: jsonb('payload'),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  importIdIdx: index('idx_cakto_import_events_import_id').on(table.importId),
  actionIdx: index('idx_cakto_import_events_action').on(table.action),
}));

export type CaktoImportEvent = typeof caktoImportEvents.$inferSelect;
export type NewCaktoImportEvent = typeof caktoImportEvents.$inferInsert;