import { Router } from 'express';
import {
  createTrip,
  getTrip,
  listActiveTrips,
  listTrips,
  updateTripLocation,
  updateTripStatus
} from '../controllers/tripController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, listTrips);
router.get('/active', protect, listActiveTrips);
router.get('/:tripId', protect, getTrip);
router.post('/', protect, authorize('driver'), createTrip);
router.patch('/:tripId/location', protect, authorize('driver'), updateTripLocation);
router.patch('/:tripId/status', protect, authorize('driver', 'admin'), updateTripStatus);

export default router;
