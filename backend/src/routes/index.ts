import { Router } from 'express';
import healthRoutes from './health.routes';
import projectRoutes from './project.routes';
import webhookRoutes from './webhook.routes';
import incidentRoutes from './incident.routes';
import incidentDiagnosisRoutes from './incidentDiagnosis.routes';
import applicationErrorRoutes from './applicationError.routes';
import monitoringRoutes from './monitoring.routes';
import authRoutes from './auth.routes';
import githubConnectionRoutes from './githubConnection.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/github-connections', githubConnectionRoutes);
router.use('/projects', projectRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/incidents', incidentRoutes);
router.use('/incidents', incidentDiagnosisRoutes);
router.use('/errors', applicationErrorRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/notifications', notificationRoutes);

export default router;
