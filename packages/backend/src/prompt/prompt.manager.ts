import { eq, asc } from 'drizzle-orm';
import { db } from '../db/db.js';
import { prompts, type Prompt, type NewPrompt } from '../db/schema.js';
import { randomUUID } from 'crypto';

export class PromptManager {

  async getAll(): Promise<Prompt[]> {
    return db.select().from(prompts).orderBy(asc(prompts.sortOrder), asc(prompts.createdAt));
  }

  async getByCategory(category: string): Promise<Prompt[]> {
    return db.select().from(prompts).where(eq(prompts.category, category)).orderBy(asc(prompts.sortOrder));
  }

  async getById(id: string): Promise<Prompt | undefined> {
    const rows = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
    return rows[0];
  }

  async create(data: Omit<NewPrompt, 'id' | 'createdAt' | 'updatedAt'>): Promise<Prompt> {
    const id = randomUUID();
    await db.insert(prompts).values({ ...data, id });
    return (await this.getById(id))!;
  }

  async update(id: string, data: Partial<Omit<NewPrompt, 'id'>>): Promise<Prompt> {
    await db.update(prompts)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(prompts.id, id));
    return (await this.getById(id))!;
  }

  async delete(id: string): Promise<void> {
    const prompt = await this.getById(id);
    if (!prompt) throw new Error('Prompt not found');
    if (prompt.isSystem) throw new Error('System prompts cannot be deleted');
    await db.delete(prompts).where(eq(prompts.id, id));
  }

  render(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
  }

  async buildFinalPrompt(
    promptId: string | null,
    userInput: string,
    extraVars: Record<string, string> = {}
  ): Promise<{ systemPrompt: string; userInput: string }> {
    if (!promptId) return { systemPrompt: '', userInput };
    const prompt = await this.getById(promptId);
    if (!prompt) return { systemPrompt: '', userInput };

    const rendered = this.render(prompt.content, { input: userInput, ...extraVars });
    if (prompt.content.includes('{{input}}')) {
      return { systemPrompt: rendered, userInput: '' };
    }
    return { systemPrompt: rendered, userInput };
  }

  async getCategories(): Promise<string[]> {
    const all = await this.getAll();
    return [...new Set(all.map((p) => p.category))];
  }
}

export const promptManager = new PromptManager();
