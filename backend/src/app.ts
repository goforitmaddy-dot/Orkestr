import express, { Express, Request } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRoutes from './routes';

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
        'X-GitHub-Event',
        'X-GitHub-Delivery',
        'X-Hub-Signature-256',
      ],
      credentials: true,
    })
  );

  // Capture the raw request body so webhook HMAC signatures can be verified
  // against the exact bytes GitHub sent.
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

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
