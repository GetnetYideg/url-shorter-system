import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { authRouter } from './auth/auth.router';
import { urlRouter } from './urls/url.router';
import { redirectRouter } from './urls/redirect.router';
import { analyticsRouter } from './analytics/analytics.router';
import { qrRouter } from './qr/qr.router';
import { adminRouter } from './admin/admin.router';
import { errorHandler, notFound } from './middleware/error.middleware';

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow redirect pages
  })
);
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const createUrlLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { success: false, message: 'Too many URL creation requests' },
});

app.use('/api', globalLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/urls', createUrlLimiter, urlRouter);
app.use('/api/urls', qrRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/admin', adminRouter);

// ─── Redirect Routes (must be last before error handlers) ────────────────────
app.use('/', redirectRouter);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await connectDatabase();
    await connectRedis();

    app.listen(config.port, () => {
      logger.info(`🚀 Server running on http://localhost:${config.port}`);
      logger.info(`📊 Environment: ${config.env}`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();

export default app;
