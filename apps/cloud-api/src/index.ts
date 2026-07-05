import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import { createSubscriptionsRouter } from './routes/subscriptions.js';
import { createLicensingRouter } from './routes/licensing.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createAdminRouter } from './routes/admin.js';
import { getDb } from './db/index.js';

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  if (err.name === 'ZodError') {
    res.status(400).json({ error: 'Validation error', details: (err as any).errors });
    return;
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

getDb();

app.listen(config.PORT, () => {
  console.log(`[Echo Cloud API] Server running on http://localhost:${config.PORT}`);
});

export default app;
