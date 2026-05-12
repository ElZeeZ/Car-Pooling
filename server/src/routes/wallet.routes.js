import { Router } from 'express';
import {
  addPaymentCard,
  deletePaymentCard,
  getWallet,
  topUpWallet,
  withdrawWallet
} from '../controllers/walletController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, authorize('driver', 'passenger'), getWallet);
router.post('/cards', protect, authorize('driver', 'passenger'), addPaymentCard);
router.delete('/cards/:cardId', protect, authorize('driver', 'passenger'), deletePaymentCard);
router.post('/top-up', protect, authorize('passenger'), topUpWallet);
router.post('/withdraw', protect, authorize('driver'), withdrawWallet);

export default router;
