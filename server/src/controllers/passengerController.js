import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const passengerFields = 'passenger_id, full_name, email, phone, account_status, created_at';

export const listPassengers = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT ${passengerFields}
     FROM passengers
     ORDER BY created_at DESC`
  );
  res.json({ passengers: rows });
});

export const getPassenger = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT ${passengerFields} FROM passengers WHERE passenger_id = ? LIMIT 1`, [
    req.params.passengerId
  ]);

  if (!rows[0]) {
    throw new HttpError(404, 'Passenger not found.');
  }

  res.json({ passenger: rows[0] });
});

export const updatePassengerStatus = asyncHandler(async (req, res) => {
  const { accountStatus } = req.body;

  if (!accountStatus) {
    throw new HttpError(400, 'accountStatus is required.');
  }

  await query('UPDATE passengers SET account_status = ? WHERE passenger_id = ?', [
    accountStatus,
    req.params.passengerId
  ]);

  res.json({ message: 'Passenger account status updated.' });
});
