import { Router } from 'express';
import {
  login,
  me,
  registerDriverAccount,
  registerPassengerAccount
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/register/passenger', registerPassengerAccount);
router.post('/register/driver', registerDriverAccount);
router.get('/me', protect, me);

export default router;
