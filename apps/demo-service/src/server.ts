import { buildDemoService } from './app.js';
import { z } from 'zod';
const listenSchema = z.object({ DEMO_HOST: z.string().default('0.0.0.0'), DEMO_PORT: z.coerce.number().int().min(1).max(65535).default(3100) });
const listen = listenSchema.parse(process.env);
const app = buildDemoService();
await app.listen({ host: listen.DEMO_HOST, port: listen.DEMO_PORT });
