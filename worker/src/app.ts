// App assembly: global middleware + route registration. OAuth wrapper and DO
// exports live in index.ts; route wiring in routes.ts.

import { Hono } from 'hono';
import type { Env } from './env';
import { ensureMigrated } from './platform/db/auto-migrate';
import { securityHeaders } from './platform/middleware/security-headers';
import { registerRoutes } from './routes';

const app = new Hono<{ Bindings: Env }>();

// Security headers middleware should run first for all routes
app.use('*', securityHeaders);

app.get("/ai-test", async (c) => {
  const { AI_TEST_KEY, AI } = c.env;
  const urlKey = c.req.query("key");

  if (!AI_TEST_KEY || (c.req.header("x-test-key") !== AI_TEST_KEY && urlKey !== AI_TEST_KEY)) {
    return c.json({ error: "forbidden" }, 403);
  }

  if (!AI) {
    return c.json({ error: "AI binding yok" }, 500);
  }

  try {
    const result = await AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [{ role: "user", content: "Tek cumlede merhaba de." }],
    });
    return c.json(result);
  } catch (error: any) {
    console.error('[ai-test] execution error:', error);
    return c.json({ 
      error: "AI çalıştırma hatası", 
      details: error?.message || String(error) 
    }, 500);
  }
});

app.post("/ai-anomaly", async (c) => {
  const { AI } = c.env;

  try {
    const body = await c.req.json();

    const aiResponse = await AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [
        {
          role: "system",
          content: `Sen bir IoT donanım ve sensör verisi anomali tespit sistemisin. 
Sana verilen sensör verilerini analiz et. 
Yanıtını ASLA metin, açıklama veya markdown bloğu olmadan SADECE geçerli bir JSON nesnesi olarak döndür.
Format tam olarak şöyle olmalıdır:
{
  "isAnomaly": true/false,
  "severity": "low/medium/high/none",
  "reason": "Anomali nedeni veya durum özeti"
}`
        },
        {
          role: "user",
          content: JSON.stringify(body)
        }
      ]
    });

    return c.json(aiResponse);
  } catch (error: any) {
    return c.json({ error: "Anomali tespiti başarısız", details: error?.message }, 500);
  }
});

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
