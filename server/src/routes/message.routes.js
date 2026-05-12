import { Router } from 'express';
import {
  createMessage,
  listMessageConversations,
  listMessagesByBooking
} from '../controllers/messageController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/conversations', protect, listMessageConversations);
router.get('/booking/:bookingId', protect, listMessagesByBooking);
router.post('/', protect, authorize('driver', 'passenger'), createMessage);

export default router;
