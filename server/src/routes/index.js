import { Router } from 'express';
import { testConnection } from '../config/db.js';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import bookingRoutes from './booking.routes.js';
import driverRoutes from './driver.routes.js';
import messageRoutes from './message.routes.js';
import passengerRoutes from './passenger.routes.js';
import reportRoutes from './report.routes.js';
import tripRoutes from './trip.routes.js';

const router = Router();

router.get('/health', async (req, res, next) => {
  try {
    await testConnection();
    res.json({
      status: 'ok',
      database: 'connected'
    });
  } catch (error) {
    next(error);
  }
});

router.use('/auth', authRoutes);
router.use('/drivers', driverRoutes);
router.use('/passengers', passengerRoutes);
router.use('/trips', tripRoutes);
router.use('/bookings', bookingRoutes);
router.use('/messages', messageRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);

export default router;
