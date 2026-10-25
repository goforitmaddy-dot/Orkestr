import { Router } from 'express';
import express from 'express';
import { handleGitHubWebhookHandler } from '../controllers/webhook.controller';

const router = Router();

/**
 * POST /api/webhooks/github
 * Raw byte parsing is used to ensure HMAC-SHA256 signature verification occurs against
 * the exact bytes transmitted by GitHub, before JSON parsing.
 */
router.post(
  '/github',
  express.raw({
    type: '*/*',
    limit: '10mb',
  }),
  handleGitHubWebhookHandler
);

export default router;
