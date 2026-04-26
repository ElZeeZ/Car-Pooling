import { Router } from 'express';
import {
  createMessage,
  listMessagesByBooking
} from '../controllers/messageController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/booking/:bookingId', protect, listMessagesByBooking);
router.post('/', protect, authorize('driver', 'passenger', 'admin'), createMessage);

export default router;
