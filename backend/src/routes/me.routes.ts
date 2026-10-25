import { Router } from 'express';
import { getMyTasksHandler } from '../controllers/me.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Protect all /me endpoints with authenticated session
router.use(requireAuth);

router.get('/tasks', getMyTasksHandler);

export default router;
