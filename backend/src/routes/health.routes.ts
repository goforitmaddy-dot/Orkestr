import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { optionalAuth } from '../middleware/auth';

const router = Router();

router.get('/', optionalAuth, getHealth);

export default router;
