import { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────
// 파일 기반 프롬프트 저장소
// data/prompts/ 폴더에 prompts.json 하나로 관리
// ─────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), 'data', 'prompts');
const FILE_PATH = join(DATA_DIR, 'prompts.json');

interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function ensureDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function readPrompts(): Prompt[] {
  ensureDir();
  if (!existsSync(FILE_PATH)) {
    writeFileSync(FILE_PATH, '[]', 'utf-8');
    return [];
  }
  return JSON.parse(readFileSync(FILE_PATH, 'utf-8'));
}

function writePrompts(prompts: Prompt[]) {
  ensureDir();
  writeFileSync(FILE_PATH, JSON.stringify(prompts, null, 2), 'utf-8');
}

export async function promptRoutes(app: FastifyInstance) {

  // 전체 목록
  app.get('/api/prompts', async (_req, reply) => {
    return reply.send(readPrompts());
  });

  // 단일 조회
  app.get<{ Params: { id: string } }>('/api/prompts/:id', async (req, reply) => {
    const prompt = readPrompts().find((p) => p.id === req.params.id);
    if (!prompt) return reply.status(404).send({ error: 'Not found' });
    return reply.send(prompt);
  });

  // 생성
  app.post('/api/prompts', async (req, reply) => {
    const { name, content } = req.body as { name: string; content: string };
    if (!name?.trim() || !content?.trim()) {
      return reply.status(400).send({ error: 'name과 content는 필수입니다' });
    }
    const now = new Date().toISOString();
    const newPrompt: Prompt = { id: randomUUID(), name: name.trim(), content: content.trim(), createdAt: now, updatedAt: now };
    const prompts = readPrompts();
    prompts.push(newPrompt);
    writePrompts(prompts);
    return reply.status(201).send(newPrompt);
  });

  // 수정
  app.patch<{ Params: { id: string } }>('/api/prompts/:id', async (req, reply) => {
    const { name, content } = req.body as { name?: string; content?: string };
    const prompts = readPrompts();
    const idx = prompts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return reply.status(404).send({ error: 'Not found' });
    if (name) prompts[idx].name = name.trim();
    if (content) prompts[idx].content = content.trim();
    prompts[idx].updatedAt = new Date().toISOString();
    writePrompts(prompts);
    return reply.send(prompts[idx]);
  });

  // 삭제
  app.delete<{ Params: { id: string } }>('/api/prompts/:id', async (req, reply) => {
    const prompts = readPrompts();
    const filtered = prompts.filter((p) => p.id !== req.params.id);
    if (filtered.length === prompts.length) return reply.status(404).send({ error: 'Not found' });
    writePrompts(filtered);
    return reply.status(204).send();
  });
}
