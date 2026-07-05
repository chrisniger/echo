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
import { getDb } from './db/index.js';
import { WsGateway } from './websocket/gateway.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api', createSubscriptionsRouter());
app.use('/api', createLicensingRouter());
app.use('/api', createNotificationsRouter());
app.use('/api', createAnalyticsRouter());
app.use('/api', createAdminRouter());
app.use('/api', pairingRoutes);

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
