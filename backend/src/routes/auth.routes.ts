import { Router } from 'express';
import {
  getCurrentUser,
  login,
  logout,
  signup,
  updateCurrentUser,
} from '../controllers/auth.controller';
import { optionalAuth, requireAuth } from '../middleware/auth';
import {
  getGitHubIdentityStatusHandler,
  startGitHubConnectHandler,
  handleGitHubCallbackHandler,
  disconnectGitHubIdentityHandler,
} from '../controllers/github.controller';

/**
 * Account and session endpoints.
 */
const router = Router();

router.post('/signup', signup);
router.post('/login', login);
// optionalAuth resolves the session so the server side record is removed too.
router.post('/logout', optionalAuth, logout);
router.get('/me', requireAuth, getCurrentUser);
router.patch('/me', requireAuth, updateCurrentUser);

// GitHub Identity Linking Endpoints
router.get('/github/status', requireAuth, getGitHubIdentityStatusHandler);
router.get('/github/connect', requireAuth, startGitHubConnectHandler);
router.get('/github/callback', handleGitHubCallbackHandler);
router.delete('/github/disconnect', requireAuth, disconnectGitHubIdentityHandler);

export default router;
