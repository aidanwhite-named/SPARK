import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chatRoutes } from './routes/chat.routes.js';
import { promptRoutes } from './routes/prompt.routes.js';
import { patentRoutes } from './routes/patent.routes.js';
import { initializeDB } from './db/db.js';

const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 }); // 10MB — PDF text can be large

// ── DB 초기화 ─────────────────────────────────────────────
await initializeDB();

await app.register(cors, { origin: true });

await app.register(chatRoutes);
await app.register(promptRoutes);
await app.register(patentRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 3001);
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`\n🚀 Backend ready → http://localhost:${PORT}\n`);
