import { pgTable, uuid, varchar, timestamp, jsonb, index, numeric, text } from 'drizzle-orm/pg-core';
import { users } from './users';

export const caktoOrphanRenewals = pgTable('cakto_orphan_renewals', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: varchar('sale_id', { length: 255 }).notNull().unique(),
  fileHash: varchar('file_hash', { length: 64 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerDocument: varchar('customer_document', { length: 50 }),
  customerPhone: varchar('customer_phone', { length: 50 }),
  productName: varchar('product_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  resolutionAction: varchar('resolution_action', { length: 50 }),
  resolutionNotes: text('resolution_notes'),
  amount: numeric('amount', { precision: 10, scale: 2 }),
  paidAt: timestamp('paid_at').notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('idx_cakto_orphan_renewals_status').on(table.status),
  emailIdx: index('idx_cakto_orphan_renewals_customer_email').on(table.customerEmail),
  resolvedByIdx: index('idx_cakto_orphan_renewals_resolved_by').on(table.resolvedBy),
}));

export type CaktoOrphanRenewal = typeof caktoOrphanRenewals.$inferSelect;
export type NewCaktoOrphanRenewal = typeof caktoOrphanRenewals.$inferInsert;