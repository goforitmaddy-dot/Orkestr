import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import * as webhookService from '../services/webhook.service';
import * as activityService from '../services/activity.service';
import * as verificationService from '../services/verification/verification.service';

/**
 * POST /api/webhooks/github
 * Ingests incoming GitHub webhook events with HMAC-SHA256 signature verification.
 * Does not require an Orkestr user session.
 */
export const handleGitHubWebhookHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
    const deliveryId = req.headers['x-github-delivery'] as string | undefined;
    const eventType = req.headers['x-github-event'] as string | undefined;

    // Validate delivery ID and event type presence
    if (!deliveryId || !eventType) {
      throw new AppError(
        'Missing required GitHub webhook headers (X-GitHub-Delivery, X-GitHub-Event)',
        400
      );
    }

    // Narrowly-scoped ping handler:
    // If GitHub sends a ping event without a signature (e.g. before secret is entered or initial setup check),
    // acknowledge receipt safely without touching database, storing records, or processing tasks.
    if (eventType === 'ping' && !signatureHeader) {
      res.status(200).json({
        success: true,
        message: 'GitHub ping event acknowledged successfully (unsigned delivery)',
        ping: true,
        deliveryId,
        warning:
          'X-Hub-Signature-256 header was not provided by GitHub. Please ensure a Webhook secret is configured in GitHub App settings and backend/.env for push and pull_request verification.',
      });
      return;
    }

    // For all push and pull_request deliveries (and any signed event), X-Hub-Signature-256 is strictly required
    if (!signatureHeader) {
      throw new AppError(
        `Missing required X-Hub-Signature-256 header for GitHub event delivery (${eventType})`,
        400
      );
    }

    // Verify server-side secret configuration
    const webhookSecret = config.github.webhookSecret;
    if (!webhookSecret || !webhookSecret.trim()) {
      throw new AppError('GitHub webhook secret is not configured on the server', 503);
    }

    // Verify signature against exact raw body buffer
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || ''));

    const isSignatureValid = webhookService.verifyWebhookSignature(
      rawBody,
      signatureHeader,
      webhookSecret
    );

    if (!isSignatureValid) {
      throw new AppError('Invalid GitHub webhook signature', 401);
    }

    // Parse JSON payload ONLY after signature verification has succeeded
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (parseErr) {
      throw new AppError('Malformed JSON payload in GitHub webhook delivery', 400);
    }

    // Ingest, deduplicate, and persist event
    const result = await webhookService.ingestWebhookEvent(deliveryId, eventType, payload);

    // Process task activity association if event was persisted
    if (result.eventId && !result.duplicate && !result.ignored) {
      try {
        const actResult = await activityService.processWebhookEvent(result.eventId);

        // Automatically trigger AI verification for any task with incoming push or PR
        if (actResult.associatedTaskIds && actResult.associatedTaskIds.length > 0) {
          for (const taskId of actResult.associatedTaskIds) {
            verificationService.verifyTask(taskId, null).catch((err) => {
              console.error(`Automatic AI verification failed for task ${taskId}:`, err?.message || err);
            });
          }
        }
      } catch (procErr) {
        console.error(`Error processing task activities for webhook event ${result.eventId}:`, procErr);
      }
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
