import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { config } from './config.js';
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
import { getDb } from './db/index.js';
import { WsGateway } from './websocket/gateway.js';

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
app.use('/api', createBillingRouter());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ws-stats', (_req, res) => {
  res.json(wsGateway.getStats());
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  if (err.name === 'ZodError') {
    res.status(400).json({ error: 'Validation error', details: (err as any).errors });
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

const server = http.createServer(app);
const wsGateway = new WsGateway(server);

server.listen(config.PORT, () => {
  console.log(`[Echo Cloud API] Server running on http://localhost:${config.PORT}`);
  console.log(`[Echo Cloud API] WebSocket available at ws://localhost:${config.PORT}/ws`);
});

export default app;
