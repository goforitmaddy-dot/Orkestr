import dotenv from 'dotenv';
import path from 'path';

// Load environment variables reliably from backend/.env regardless of CWD
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  database: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ai_project_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'orkestr-dev-session-secret-change-in-prod',
  },
  github: {
    clientId: process.env.GITHUB_APP_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET || '',
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    webhookSecret: (process.env.GITHUB_WEBHOOK_SECRET || '').trim().replace(/^["']|["']$/g, ''),
    oauthCallbackUrl:
      process.env.GITHUB_OAUTH_CALLBACK_URL ||
      `http://localhost:${process.env.PORT || '5001'}/api/auth/github/callback`,
    frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
};
