import { Router } from 'express';
import {
  deleteAccount,
  getAdminDashboard,
  getAdminSummary,
  listAccounts,
  listAdminReports,
  listAdminTransactions,
  listAdminTrips,
  listPendingDrivers,
  rejectDriver,
  updateAccountStatus,
  updateAdminReportStatus,
  verifyDriver
} from '../controllers/adminController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/summary', protect, authorize('admin'), getAdminSummary);
router.get('/dashboard', protect, authorize('admin'), getAdminDashboard);
router.get('/drivers/pending', protect, authorize('admin'), listPendingDrivers);
router.patch('/drivers/:driverId/verify', protect, authorize('admin'), verifyDriver);
router.patch('/drivers/:driverId/reject', protect, authorize('admin'), rejectDriver);
router.get('/accounts', protect, authorize('admin'), listAccounts);
router.patch('/accounts/:role/:accountId/status', protect, authorize('admin'), updateAccountStatus);
router.patch('/accounts/:accountId/status', protect, authorize('admin'), updateAccountStatus);
router.delete('/accounts/:role/:accountId', protect, authorize('admin'), deleteAccount);
router.get('/reports', protect, authorize('admin'), listAdminReports);
router.patch('/reports/:reportId/status', protect, authorize('admin'), updateAdminReportStatus);
router.get('/trips', protect, authorize('admin'), listAdminTrips);
router.get('/transactions', protect, authorize('admin'), listAdminTransactions);

export default router;
