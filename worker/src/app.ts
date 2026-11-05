// App assembly: global middleware + route registration. OAuth wrapper and DO
// exports live in index.ts; route wiring in routes.ts.

import { Hono } from 'hono';
import type { Env } from './env';
import { ensureMigrated } from './platform/db/auto-migrate';
import { securityHeaders } from './platform/middleware/security-headers';
import { registerRoutes } from './routes';

const app = new Hono<{ Bindings: Env }>();

app.get("/ai-test", async (c) => {
  const env = c.env as any;
  if (!env.AI_TEST_KEY || c.req.header("x-test-key") !== env.AI_TEST_KEY) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (!env.AI) {
    return c.json({ error: "AI binding yok" }, 500);
  }
  const result = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    messages: [{ role: "user", content: "Tek cumlede merhaba de." }],
  });
  return c.json(result);
});

app.use('*', securityHeaders);

// First request after a deploy applies pending migrations; guarded + best-effort.
app.use('*', async (c, next) => {
  try {
    await ensureMigrated(c.env.DB);
  } catch (e) {
    console.error('[migrate] non-fatal:', e);
  }
  await next();
});

registerRoutes(app);

export default app;
