import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { normalizeGitHubPayload } from '../services/normalizer.service';
import { correlateMonitoringRecord } from '../services/incidentCorrelation.service';
import { AppError } from '../middleware/errorHandler';
import * as webhookService from '../services/webhook.service';
import * as activityService from '../services/activity.service';
import * as verificationService from '../services/verification/verification.service';

/**
 * Webhook Controller
 *
 * Receives genuine CI webhook deliveries from GitHub, verifies their HMAC
 * signature, then normalises and correlates them into incidents.
 */

/**
 * Event types that can produce a workflow failure worth tracking.
 */
const TRACKED_EVENTS = new Set(['workflow_run', 'workflow_job', 'check_run']);

const verifySignature = (rawBody: Buffer, signature: string | undefined): boolean => {
  if (!config.github.webhookSecret) return true;

  if (!signature) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', config.github.webhookSecret).update(rawBody).digest('hex');

  const provided = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;

  const expectedBuffer = Buffer.from(expected, 'utf-8');
  const providedBuffer = Buffer.from(provided, 'utf-8');

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

export const handleGitHubWebhookHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');

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

    const rawPayload = req.body || {};

    // 2. Ignore event types that cannot describe a workflow failure
    if (eventType && !TRACKED_EVENTS.has(eventType)) {
      res.status(202).json({
        success: true,
        ignored: true,
        message: `Event type "${eventType}" is not tracked.`,
      });
      return;
    }

    // 3. Normalise into a standardized monitoring record
    const normalizedRecord = normalizeGitHubPayload(rawPayload, req.headers);

    // 4. Deduplicate the delivery and correlate it into the incident model
    const result = await correlateMonitoringRecord(normalizedRecord, rawPayload);

    // Ingest, deduplicate, and persist event
    const ingestResult = await webhookService.ingestWebhookEvent(deliveryId, eventType, payload);

    // Process task activity association if event was persisted
    if (ingestResult.eventId && !ingestResult.duplicate && !ingestResult.ignored) {
      try {
        const actResult = await activityService.processWebhookEvent(ingestResult.eventId);

        // Automatically trigger AI verification for any task with incoming push or PR
        if (actResult.associatedTaskIds && actResult.associatedTaskIds.length > 0) {
          for (const taskId of actResult.associatedTaskIds) {
            verificationService.verifyTask(taskId, null).catch((err) => {
              console.error(`Automatic AI verification failed for task ${taskId}:`, err?.message || err);
            });
          }
        }
      } catch (procErr) {
        console.error(`Error processing task activities for webhook event ${ingestResult.eventId}:`, procErr);
      }
    }

    const statusCode = result.isDuplicate
      ? 200
      : result.actionTaken === 'CREATED_INCIDENT'
      ? 201
      : 200;

    res.status(statusCode).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
