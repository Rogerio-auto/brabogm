import { pgTable, uuid, varchar, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const caktoImports = pgTable('cakto_imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').references(() => users.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileHash: varchar('file_hash', { length: 64 }).notNull(),
  fileSize: integer('file_size').notNull(),
  status: varchar('status', { length: 30 }).notNull().default('in_progress'),
  summary: jsonb('summary'),
  planSnapshot: jsonb('plan_snapshot'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  adminIdIdx: index('idx_cakto_imports_admin_id').on(table.adminId),
  fileHashIdx: index('idx_cakto_imports_file_hash').on(table.fileHash),
  statusIdx: index('idx_cakto_imports_status').on(table.status),
  createdAtIdx: index('idx_cakto_imports_created_at').on(table.createdAt),
}));

export type CaktoImport = typeof caktoImports.$inferSelect;
export type NewCaktoImport = typeof caktoImports.$inferInsert;