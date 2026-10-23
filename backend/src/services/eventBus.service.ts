import { Response } from 'express';

/**
 * Server-Sent Events bus.
 *
 * The monitoring pipeline writes to the database first and then notifies
 * subscribers, so the browser receives an event only after the corresponding
 * state has been persisted. Clients can safely re-fetch on every event.
 */

export type MonitoringEventType =
  | 'incident.created'
  | 'incident.updated'
  | 'incident.resolved'
  | 'error.created'
  | 'error.updated'
  | 'error.resolved'
  | 'monitoring.status';

export interface MonitoringEvent {
  type: MonitoringEventType;
  data: unknown;
  timestamp: string;
}

interface Subscriber {
  id: number;
  res: Response;
}

const subscribers = new Map<number, Subscriber>();
let nextSubscriberId = 1;

const HEARTBEAT_INTERVAL_MS = 25000;

/**
 * Registers an Express response as an SSE stream.
 */
export const subscribe = (res: Response): (() => void) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy buffering so events are flushed immediately.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const id = nextSubscriberId++;
  subscribers.set(id, { id, res });

  // Tell the client the stream is live and how to stay in sync.
  writeEvent(res, 'monitoring.status', {
    connected: true,
    subscriberId: id,
    subscribers: subscribers.size,
  });

  const keepAlive = setInterval(() => {
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(keepAlive);
    subscribers.delete(id);
  };

  res.on('close', cleanup);
  res.on('error', cleanup);

  return cleanup;
};

const writeEvent = (res: Response, type: string, data: unknown): void => {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

/**
 * Broadcasts an event to every connected subscriber.
 */
export const publish = (type: MonitoringEventType, data: unknown): void => {
  const event: MonitoringEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const subscriber of subscribers.values()) {
    try {
      writeEvent(subscriber.res, type, event.data);
    } catch {
      // The client disconnected mid-write; cleanup happens on the close handler.
      subscribers.delete(subscriber.id);
    }
  }
};

/**
 * Number of currently connected listeners (surfaced in the health endpoint).
 */
export const subscriberCount = (): number => subscribers.size;

/**
 * Closes every open stream. Used during graceful shutdown.
 */
export const closeAll = (): void => {
  for (const subscriber of subscribers.values()) {
    try {
      subscriber.res.end();
    } catch {
      // Ignore errors while tearing down.
    }
  }
  subscribers.clear();
};
