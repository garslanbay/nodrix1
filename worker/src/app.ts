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
  const body = await c.req.json(); // { device_id, temperature, current, voltage }

  const prompt = `
  Aşağıdaki IoT sensör verilerini analiz et ve anomali olup olmadığını kontrol et.
  Veri: ${JSON.stringify(body)}
  
  Sadece şu JSON formatında yanıt ver:
  {
    "isAnomaly": true/false,
    "severity": "low/medium/high",
    "reason": "Kısa açıklama"
  }
  `;

  try {
    const aiResponse = await AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [{ role: "user", content: prompt }],
    });
    
    return c.json(aiResponse);
  } catch (error: any) {
    return c.json({ error: "Anomali analizi başarısız", details: error?.message }, 500);
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
