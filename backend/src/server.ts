import app from './app';
import { config } from './config/env';
import { pool } from './db';
import { startCiMonitor, stopCiMonitor } from './services/ciMonitor.service';
import { closeAll } from './services/eventBus.service';
import { processPendingWebhookEvents } from './services/activity.service';

const server = app.listen(config.port, () => {
  console.log(`=================================`);
  console.log(`🚀 AI Project Manager Backend`);
  console.log(`📡 Server listening on port ${config.port}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Health check: http://localhost:${config.port}/api/health`);
  console.log(`📨 Live event stream: http://localhost:${config.port}/api/monitoring/stream`);
  console.log(`=================================`);

  // Process any pending webhook events on startup
  processPendingWebhookEvents().catch((err) => {
    console.error('Error processing pending webhook events on startup:', err);
  });
});

// Start the background CI monitoring poller
startCiMonitor();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  stopCiMonitor();
  closeAll();
  if (typeof (server as any).closeAllConnections === 'function') {
    (server as any).closeAllConnections();
  }
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('Database pool drained.');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(0);
  });

  // Force shutdown after 2s if graceful fails
  setTimeout(() => {
    process.exit(0);
  }, 2000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
