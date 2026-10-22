import { Request, Response } from 'express';
import { checkDatabaseConnection } from '../db';

export const getHealth = async (_req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();

  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      api: 'healthy',
      database: isDbConnected ? 'connected' : 'disconnected',
    },
  });
};
