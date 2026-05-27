import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull().default('general'),
  content: text('content').notNull(),
  variables: text('variables').default('[]'),
  isSystem: integer('is_system', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('새 대화'),
  llmType: text('llm_type').notNull(),
  promptId: text('prompt_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  llmType: text('llm_type'),
  promptId: text('prompt_id'),
  tokenCount: integer('token_count'),
  durationMs: integer('duration_ms'),
  metadata: text('metadata'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  sessionId: text('session_id'),
  content: text('content').notNull(),
  format: text('format').notNull().default('markdown'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Report = typeof reports.$inferSelect;
