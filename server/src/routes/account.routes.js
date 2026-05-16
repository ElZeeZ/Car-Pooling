import { Router } from 'express';
import {
  addDriverVehicle,
  deleteDriverVehicle,
  getAccount,
  selectDriverVehicle,
  updatePassword,
  updateProfile
} from '../controllers/accountController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();

router.use(protect, authorize('driver', 'passenger'));
router.get('/', getAccount);
router.patch('/profile', updateProfile);
router.patch('/password', updatePassword);
router.post('/vehicles', addDriverVehicle);
router.patch('/vehicles/:vehicleId/active', selectDriverVehicle);
router.delete('/vehicles/:vehicleId', deleteDriverVehicle);

export default router;

