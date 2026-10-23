import express, { Express } from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db';
import { config } from './config/env';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRoutes from './routes';
import webhookRoutes from './routes/webhook.routes';

export const createApp = (): Express => {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin === config.corsOrigin ||
          /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Hub-Signature-256',
        'X-GitHub-Delivery',
        'X-GitHub-Event',
      ],
      credentials: true,
    })
  );

  // GitHub webhooks route mounted BEFORE global body parsers to ensure the exact raw byte buffer
  // is preserved for HMAC-SHA256 signature verification and parsed to JSON only after verification.
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  // Session management backed by PostgreSQL
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: false,
      }),
      name: 'orkestr.sid',
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  if (!config.isProduction) {
    app.use(requestLogger);
  }

  // Mount API routes
  app.use('/api', apiRoutes);

  // Catch 404s
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
};

export default createApp();
