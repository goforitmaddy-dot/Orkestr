import { Router } from 'express';
import { handleGitHubWebhook } from '../controllers/webhook.controller';

const router = Router();

/**
 * Receives genuine GitHub webhook deliveries (workflow_run, workflow_job,
 * check_run). Requests are verified against GITHUB_WEBHOOK_SECRET when one
 * is configured.
 */
router.post('/github', handleGitHubWebhook);

export default router;
