import { Router } from 'express';
import {
  createTrip,
  getTrip,
  listTrips,
  updateTripStatus
} from '../controllers/tripController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, listTrips);
router.get('/:tripId', protect, getTrip);
router.post('/', protect, authorize('driver'), createTrip);
router.patch('/:tripId/status', protect, authorize('driver', 'admin'), updateTripStatus);

export default router;
