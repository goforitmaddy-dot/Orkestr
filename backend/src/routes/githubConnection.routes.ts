import { Router } from 'express';
import {
  createUserConnection,
  listUserConnections,
  removeUserConnection,
  revalidateUserConnection,
  validateUserConnection,
} from '../controllers/githubConnection.controller';
import { requireAuth } from '../middleware/auth';

/**
 * Per-user GitHub connections.
 *
 * Every user connects their own personal access token; the server never
 * shares one account's credential with another.
 */
const router = Router();

router.use(requireAuth);

router.get('/', listUserConnections);
router.post('/', createUserConnection);
router.get('/:id', validateUserConnection);
router.post('/:id/validate', revalidateUserConnection);
router.delete('/:id', removeUserConnection);

export default router;
