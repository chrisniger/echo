import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import os from 'os';
import Bonjour from 'bonjour-service';
import { z } from 'zod';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import { createSubscriptionsRouter } from './routes/subscriptions.js';
import { createLicensingRouter } from './routes/licensing.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createAdminRouter } from './routes/admin.js';
import pairingRoutes from './routes/pairing.js';
import { createPushRouter } from './routes/push.js';
import { createSyncRouter } from './routes/sync.js';
import { createBillingRouter } from './routes/billing.js';
import sessionRoutes from './routes/sessions.js';
import { createCvRouter } from './routes/cv.js';
import { getDb, logDbHealth } from './db/index.js';
import { HttpError } from './lib/errors.js';
import { WsGateway } from './websocket/gateway.js';
import { setWsGateway } from './websocket/gateway-singleton.js';

// Sentry is configured via SENTRY_DSN env var — it's loaded and initialized in a separate step
// When deploying, set SENTRY_DSN and use @sentry/node's tracing integrations

const app = express();

app.use(helmet() as any);
app.use(cors({ origin: config.CORS_ORIGIN }) as any);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api', createSubscriptionsRouter());
app.use('/api', createLicensingRouter());
app.use('/api', createNotificationsRouter());
app.use('/api', createAnalyticsRouter());
app.use('/api', createAdminRouter());
app.use('/api', pairingRoutes);
app.use('/api', createPushRouter());
app.use('/api', createSyncRouter());
app.use('/api', sessionRoutes);
app.use('/api', createCvRouter());
app.use('/api', createBillingRouter());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ws-stats', (_req, res) => {
  res.json(wsGateway.getStats());
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // For expected 4xx errors (e.g. wrong password) log a short warning.
  // Unexpected 5xx errors get the full stack trace for debugging.
  if (err instanceof HttpError && err.statusCode < 500) {
    console.warn(`[${err.statusCode}] ${req.method} ${req.path}: ${err.message}`);
  } else if (err.name === 'ZodError') {
    console.warn(`[400] ${req.method} ${req.path}: Validation error`);
  } else {
    console.error('[ERROR]', err);
  }

  if (err.name === 'ZodError') {
    res.status(400).json({ error: 'Validation error', details: (err as any).errors });
    return;
  }
  if (err instanceof HttpError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Auto-updater endpoint (Tauri updater reads this)
app.get('/api/updates', (_req, res) => {
  res.json({
    version: process.env.APP_VERSION || '0.1.0',
    pub_date: new Date().toISOString(),
    url: process.env.UPDATE_DOWNLOAD_URL || '',
    signature: process.env.UPDATE_SIGNATURE || '',
    notes: process.env.UPDATE_NOTES || 'Bug fixes and improvements',
  });
});

declare module 'express' {
  interface Request {
    user?: { id: string; email: string; role: string };
  }
}

getDb();
logDbHealth();

// Shared mDNS state so the /settings/mdns endpoint can enable/disable
// advertisement at runtime without restarting the server.
let mdnsBonjour: Bonjour | null = null;
let mdnsService: any = null;
let mdnsEnabled = process.env.ENABLE_MDNS !== 'false';

function publishMdns() {
  if (!mdnsEnabled || mdnsService !== null) return;
  try {
    mdnsBonjour = new Bonjour();
    const hostname = os.hostname() || 'unknown';
    mdnsService = mdnsBonjour.publish({
      name: `Echo Cloud API (${hostname})`,
      type: 'echo',
      protocol: 'tcp',
      port: config.PORT,
      txt: { path: '/api', version: '1.0.0' },
    });
    console.log(`[Echo Cloud API] mDNS advertisement started: _echo._tcp on port ${config.PORT}`);
  } catch (err) {
    console.error('[Echo Cloud API] Failed to start mDNS advertisement:', err);
  }
}

function unpublishMdns() {
  if (mdnsBonjour === null) return;
  try {
    mdnsBonjour.unpublishAll(() => {
      mdnsBonjour?.destroy();
      mdnsBonjour = null;
      mdnsService = null;
      console.log('[Echo Cloud API] mDNS advertisement stopped');
    });
  } catch (err) {
    console.error('[Echo Cloud API] Failed to stop mDNS advertisement:', err);
  }
}

const server = http.createServer(app);
const wsGateway = new WsGateway(server);

// Register the gateway singleton so route handlers (e.g. PATCH /sessions/:id)
// can broadcast WS events without app.locals or a router factory.
setWsGateway(wsGateway);

// Runtime toggle for mDNS advertisement from the desktop settings UI.
const mdnsToggleSchema = z.object({ enabled: z.boolean() });
app.post('/api/settings/mdns', requireAuth, (req, res) => {
  const parsed = mdnsToggleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.errors });
    return;
  }
  mdnsEnabled = parsed.data.enabled;
  if (mdnsEnabled) {
    publishMdns();
  } else {
    unpublishMdns();
  }
  res.json({ enabled: mdnsEnabled });
});

if (!config.aiGatewayApiKey) {
  console.warn(
    '[Echo Cloud API] AI_GATEWAY_API_KEY is not set. Server-to-server calls to the AI Gateway will be rejected unless you configure a shared key.',
  );
}

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`[Echo Cloud API] Server running on http://0.0.0.0:${config.PORT}`);
  console.log(`[Echo Cloud API] WebSocket available at ws://0.0.0.0:${config.PORT}/ws`);

  // Start mDNS advertisement if enabled (default true). The desktop can toggle
  // this at runtime via POST /api/settings/mdns.
  publishMdns();
});

export default app;
