import { Router } from 'express';
import {
  getDriver,
  listActiveDrivers,
  listDrivers,
  updateDriverVerification
} from '../controllers/driverController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/active', protect, listActiveDrivers);
router.get('/', protect, authorize('admin'), listDrivers);
router.get('/:driverId', protect, getDriver);
router.patch('/:driverId/verification', protect, authorize('admin'), updateDriverVerification);

export default router;
