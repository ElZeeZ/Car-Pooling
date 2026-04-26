import { Router } from 'express';
import {
  createBooking,
  listBookings,
  updateBookingStatus,
  updatePaymentStatus
} from '../controllers/bookingController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, listBookings);
router.post('/', protect, authorize('passenger'), createBooking);
router.patch('/:bookingId/status', protect, authorize('driver', 'admin'), updateBookingStatus);
router.patch('/:bookingId/payment', protect, authorize('passenger', 'admin'), updatePaymentStatus);

export default router;
