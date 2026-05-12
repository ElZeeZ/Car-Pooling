import { Router } from 'express';
import {
  createBooking,
  createDriverAcceptedBooking,
  listBookings,
  updateBookingStatus,
  updatePaymentStatus
} from '../controllers/bookingController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, listBookings);
router.post('/', protect, authorize('passenger'), createBooking);
router.post('/driver-accepted', protect, authorize('driver'), createDriverAcceptedBooking);
router.patch('/:bookingId/status', protect, authorize('driver', 'passenger', 'admin'), updateBookingStatus);
router.patch('/:bookingId/payment', protect, authorize('driver', 'passenger', 'admin'), updatePaymentStatus);

export default router;
