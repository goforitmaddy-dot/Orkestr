import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { normalizeGitHubPayload } from '../services/normalizer.service';
import { correlateMonitoringRecord } from '../services/incidentCorrelation.service';
import { AppError } from '../middleware/errorHandler';

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

export const handleGitHubWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const headers = req.headers || {};

    // 1. Verify the delivery came from GitHub (when a secret is configured)
    if (config.github.webhookSecret) {
      const signature = headers['x-hub-signature-256'];
      if (!verifySignature(rawBody ?? Buffer.from(''), typeof signature === 'string' ? signature : undefined)) {
        throw new AppError('Invalid or missing webhook signature', 401);
      }
    }

    const rawPayload = req.body || {};
    const eventType = String(headers['x-github-event'] || '');

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
    const normalizedRecord = normalizeGitHubPayload(rawPayload, headers);

    // 4. Deduplicate the delivery and correlate it into the incident model
    const result = await correlateMonitoringRecord(normalizedRecord, rawPayload);

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
