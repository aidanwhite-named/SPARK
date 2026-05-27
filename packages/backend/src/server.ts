import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chatRoutes } from './routes/chat.routes.js';
import { promptRoutes } from './routes/prompt.routes.js';

const app = Fastify({ logger: false });

await app.register(cors, { origin: true });
await app.register(chatRoutes);
await app.register(promptRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 3001);
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`\n🚀 Backend ready → http://localhost:${PORT}\n`);
