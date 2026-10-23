import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimiter';
import {
  getGitHubIdentityStatusHandler,
  startGitHubConnectHandler,
  handleGitHubCallbackHandler,
  disconnectGitHubIdentityHandler,
} from '../controllers/github.controller';

const router = Router();

router.post('/register', registerRateLimiter, registerHandler);
router.post('/login', loginRateLimiter, loginHandler);
router.post('/logout', logoutHandler);
router.get('/me', meHandler);

// GitHub Identity Linking Endpoints
router.get('/github/status', requireAuth, getGitHubIdentityStatusHandler);
router.get('/github/connect', requireAuth, startGitHubConnectHandler);
router.get('/github/callback', handleGitHubCallbackHandler);
router.delete('/github/disconnect', requireAuth, disconnectGitHubIdentityHandler);

export default router;
