import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adapterFactory } from '../adapters/adapter.factory.js';
import { LLMType } from '../adapters/base.adapter.js';

const ChatRequestSchema = z.object({
  llmType: z.enum(['claude', 'gemini', 'gpt']),
  model: z.string().optional(),
  promptContent: z.string().optional(), // 선택된 프롬프트 내용
  userInput: z.string().min(1),
});

export async function chatRoutes(app: FastifyInstance) {

  // ── SSE 스트리밍 ─────────────────────────────────────────────
  app.post('/api/chat/stream', async (req, reply) => {
    const body = ChatRequestSchema.parse(req.body);
    const adapter = adapterFactory.get(body.llmType as LLMType);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data: object) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    // 프롬프트 조합: {{input}} 치환 또는 앞에 붙이기
    let finalPrompt = body.userInput;
    if (body.promptContent) {
      if (body.promptContent.includes('{{input}}')) {
        finalPrompt = body.promptContent.replace(/\{\{input\}\}/g, body.userInput);
      } else {
        finalPrompt = `${body.promptContent}\n\n---\n\n${body.userInput}`;
      }
    }

    try {
      await adapter.stream(
        { prompt: '', userInput: finalPrompt, model: body.model, stream: true },
        (chunk) => { send(chunk); }
      );
    } catch (err) {
      send({ type: 'error', error: String(err) });
    } finally {
      reply.raw.end();
    }
  });

  // ── LLM 가용성 ───────────────────────────────────────────────
  app.get('/api/llm/availability', async (_req, reply) => {
    const availability = await adapterFactory.getAvailability();
    return reply.send(
      adapterFactory.getAll().map((a) => ({
        type: a.llmType,
        name: a.displayName,
        models: a.getModels(),
        available: availability[a.llmType] ?? false,
      }))
    );
  });
}
