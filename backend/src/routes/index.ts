import { Router } from 'express';
import healthRoutes from './health.routes';
import projectRoutes from './project.routes';
import taskRoutes from './task.routes';
import authRoutes from './auth.routes';
import meRoutes from './me.routes';
import { listUsersHandler } from '../controllers/member.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/me', meRoutes);
router.get('/users', requireAuth, listUsersHandler);

export default router;
