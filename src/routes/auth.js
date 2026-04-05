import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { login, logout, register, listSessions, revokeSession } from '../controllers/authController.js';

const router = Router();

router.post('/login',    login);
router.post('/register', register);
router.post('/logout',   authenticate, logout);

// Session monitoring — admin only
router.get('/sessions',        authenticate, authorize('admin'), listSessions);
router.delete('/sessions/:id', authenticate, authorize('admin'), revokeSession);

export default router;
