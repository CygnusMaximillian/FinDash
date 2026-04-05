import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createRecordSchema, updateRecordSchema, pollQuerySchema } from '../validators/schemas.js';
import {
  getDashboard,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getRecordAudit,
} from '../controllers/recordsController.js';

const router = Router();
router.use(authenticate);

router.get('/dashboard',   getDashboard);
router.get('/',            validateQuery(pollQuerySchema), listRecords);
router.get('/:id',         getRecord);
router.get('/:id/audit',   authorize('analyst', 'admin'), getRecordAudit);
router.post('/',           authorize('admin'), validateBody(createRecordSchema), createRecord);
router.patch('/:id',       authorize('admin'), validateBody(updateRecordSchema), updateRecord);
router.delete('/:id',      authorize('admin'), deleteRecord);

export default router;
