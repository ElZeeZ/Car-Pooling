import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const driverFields =
  'driver_id, full_name, email, phone, license_number, verification_status, vehicle_info, available_seats, account_status, created_at';

export const listDrivers = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT ${driverFields}
     FROM drivers
     ORDER BY created_at DESC`
  );
  res.json({ drivers: rows });
});

export const listActiveDrivers = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT ${driverFields}
     FROM drivers
     WHERE verification_status = 'verified' AND account_status = 'active'
     ORDER BY full_name`
  );
  res.json({ drivers: rows });
});

export const getDriver = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT ${driverFields} FROM drivers WHERE driver_id = ? LIMIT 1`, [
    req.params.driverId
  ]);

  if (!rows[0]) {
    throw new HttpError(404, 'Driver not found.');
  }

  res.json({ driver: rows[0] });
});

export const updateDriverVerification = asyncHandler(async (req, res) => {
  const { verificationStatus } = req.body;

  if (!verificationStatus) {
    throw new HttpError(400, 'verificationStatus is required.');
  }

  await query('UPDATE drivers SET verification_status = ? WHERE driver_id = ?', [
    verificationStatus,
    req.params.driverId
  ]);

  res.json({ message: 'Driver verification status updated.' });
});
