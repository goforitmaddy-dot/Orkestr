import { Router } from 'express';
import {
  ingestApplicationError,
  listApplicationErrorRecords,
  getApplicationErrorRecord,
  resolveApplicationErrorRecord,
} from '../controllers/applicationError.controller';
import { optionalAuth, requireAuth } from '../middleware/auth';

const router = Router();

/**
 * Runtime error ingestion.
 *
 * Point your application's error reporter (Sentry SDK, Bugsnag, Rollbar or a
 * plain HTTP client) at POST /api/errors. Payloads are accepted in a
 * Sentry-compatible shape.
 */
// Reporting stays open so external services can submit errors without a
// session, but a signed-in reporter still gets linked to their project.
router.post('/', optionalAuth, ingestApplicationError);
router.get('/', requireAuth, listApplicationErrorRecords);
router.get('/:id', requireAuth, getApplicationErrorRecord);
router.post('/:id/resolve', requireAuth, resolveApplicationErrorRecord);

export default router;
