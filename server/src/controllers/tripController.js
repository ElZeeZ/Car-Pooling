import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const listTrips = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT
       t.trip_id,
       t.driver_id,
       d.full_name AS driver_name,
       t.origin,
       t.destination,
       t.route,
       t.trip_time,
       t.available_seats,
       t.trip_status
     FROM trips t
     JOIN drivers d ON d.driver_id = t.driver_id
     ORDER BY t.trip_time DESC`
  );

  res.json({ trips: rows });
});

export const getTrip = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT
       t.*,
       d.full_name AS driver_name,
       d.verification_status
     FROM trips t
     JOIN drivers d ON d.driver_id = t.driver_id
     WHERE t.trip_id = ?
     LIMIT 1`,
    [req.params.tripId]
  );

  if (!rows[0]) {
    throw new HttpError(404, 'Trip not found.');
  }

  res.json({ trip: rows[0] });
});

export const createTrip = asyncHandler(async (req, res) => {
  const { origin, destination, route, tripTime, availableSeats } = req.body;

  if (!origin || !destination || !tripTime || !availableSeats) {
    throw new HttpError(400, 'origin, destination, tripTime, and availableSeats are required.');
  }

  const result = await query(
    `INSERT INTO trips (driver_id, origin, destination, route, trip_time, available_seats)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, origin, destination, route ?? null, tripTime, availableSeats]
  );

  res.status(201).json({
    message: 'Trip created.',
    tripId: result.insertId
  });
});

export const updateTripStatus = asyncHandler(async (req, res) => {
  const { tripStatus } = req.body;

  if (!tripStatus) {
    throw new HttpError(400, 'tripStatus is required.');
  }

  await query('UPDATE trips SET trip_status = ? WHERE trip_id = ?', [
    tripStatus,
    req.params.tripId
  ]);

  res.json({ message: 'Trip status updated.' });
});
