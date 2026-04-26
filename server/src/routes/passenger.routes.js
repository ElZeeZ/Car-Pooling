import { Router } from 'express';
import {
  getPassenger,
  listPassengers,
  updatePassengerStatus
} from '../controllers/passengerController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, authorize('admin'), listPassengers);
router.get('/:passengerId', protect, getPassenger);
router.patch('/:passengerId/status', protect, authorize('admin'), updatePassengerStatus);

export default router;
