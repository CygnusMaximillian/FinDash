import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../validators/schemas.js';
import { listUsers, getUser, createUser, updateUser, deactivateUser } from '../controllers/userController.js';

const router = Router();

// All user-management routes require admin
router.use(authenticate, authorize('admin'));

// :role = admin | analyst | viewer
router.get('/:role',        listUsers);
router.get('/:role/:id',    getUser);
router.post('/',            validateBody(createUserSchema), createUser);
router.patch('/:role/:id',  validateBody(updateUserSchema), updateUser);
router.delete('/:role/:id', deactivateUser);

export default router;
