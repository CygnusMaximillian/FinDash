// src/routes/auth.js
import { Router } from 'express';
import { login, logout } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema } from '../validators/schemas.js';

const router = Router();

router.post('/login',  validateBody(loginSchema), login);
router.post('/logout', authenticate, logout);

export default router;
