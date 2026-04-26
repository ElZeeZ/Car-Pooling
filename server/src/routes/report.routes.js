import { Router } from 'express';
import {
  createReport,
  listReports,
  updateReportStatus
} from '../controllers/reportController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, authorize('admin'), listReports);
router.post('/', protect, authorize('passenger', 'driver'), createReport);
router.patch('/:reportId/status', protect, authorize('admin'), updateReportStatus);

export default router;
