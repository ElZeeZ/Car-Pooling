import { Router } from 'express';
import {
  getAdminSummary,
  updateAccountStatus
} from '../controllers/adminController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/summary', protect, authorize('admin'), getAdminSummary);
router.patch('/accounts/:accountId/status', protect, authorize('admin'), updateAccountStatus);

export default router;
