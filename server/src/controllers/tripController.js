import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const toNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const listTrips = asyncHandler(async (req, res) => {
  const params = [];
  let roleFilter = '';

  if (req.user.role === 'driver') {
    roleFilter = 'WHERE t.driver_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'passenger') {
    roleFilter = `WHERE EXISTS (
      SELECT 1
      FROM bookings rb
      WHERE rb.trip_id = t.trip_id
        AND rb.passenger_id = ?
    )`;
    params.push(req.user.id);
  }

  const rows = await query(
    `SELECT
       t.trip_id,
       t.driver_id,
       d.full_name AS driver_name,
       d.vehicle_info,
       d.verification_status,
       d.rating_average,
       d.rating_count,
       t.origin,
       t.origin_lat,
       t.origin_lng,
       t.destination,
       t.destination_lat,
       t.destination_lng,
       t.driver_current_lat,
       t.driver_current_lng,
       t.last_location_at,
       t.route,
       t.trip_time,
       t.available_seats,
       t.trip_status,
       t.created_at,
       t.updated_at,
       COALESCE(bp.booking_count, 0) AS booking_count,
       COALESCE(bp.passengers, '') AS passengers
     FROM trips t
     JOIN drivers d ON d.driver_id = t.driver_id
     LEFT JOIN (
       SELECT
         b.trip_id,
         COUNT(*) AS booking_count,
         GROUP_CONCAT(
           CONCAT('#', b.booking_id, ' ', p.full_name, ' (', b.booking_status, ')')
           ORDER BY b.booking_id
           SEPARATOR ', '
         ) AS passengers
       FROM bookings b
       JOIN passengers p ON p.passenger_id = b.passenger_id
       GROUP BY b.trip_id
     ) bp ON bp.trip_id = t.trip_id
     ${roleFilter}
     ORDER BY t.trip_time DESC`,
    params
  );

  res.json({ trips: rows });
});

export const listActiveTrips = asyncHandler(async (req, res) => {
  const minSeats = Math.max(1, Number(req.query.minSeats ?? 1));
  const rows = await query(
    `SELECT
       t.trip_id,
       t.driver_id,
       d.full_name AS driver_name,
       d.vehicle_info,
       d.verification_status,
       d.rating_average,
       d.rating_count,
       t.origin,
       t.origin_lat,
       t.origin_lng,
       t.destination,
       t.destination_lat,
       t.destination_lng,
       t.driver_current_lat,
       t.driver_current_lng,
       t.last_location_at,
       t.route,
       t.trip_time,
       t.available_seats,
       GREATEST(
         t.available_seats - COALESCE(SUM(
           CASE
             WHEN b.booking_status IN ('pending', 'accepted', 'picked_up', 'payment_due') THEN b.seats_requested
             ELSE 0
           END
         ), 0),
         0
       ) AS remaining_seats,
       t.trip_status
     FROM trips t
     JOIN drivers d ON d.driver_id = t.driver_id
     LEFT JOIN bookings b ON b.trip_id = t.trip_id
     WHERE t.trip_status = 'active'
       AND t.driver_current_lat IS NOT NULL
       AND t.driver_current_lng IS NOT NULL
     GROUP BY
       t.trip_id,
       t.driver_id,
       d.full_name,
       d.vehicle_info,
       d.verification_status,
       d.rating_average,
       d.rating_count,
       t.origin,
       t.origin_lat,
       t.origin_lng,
       t.destination,
       t.destination_lat,
       t.destination_lng,
       t.driver_current_lat,
       t.driver_current_lng,
       t.last_location_at,
       t.route,
       t.trip_time,
       t.available_seats,
       t.trip_status
     HAVING remaining_seats >= ?
     ORDER BY t.trip_time DESC`,
    [minSeats]
  );

  res.json({ trips: rows });
});

export const getTrip = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT
       t.*,
       d.full_name AS driver_name,
       d.verification_status,
       d.rating_average,
       d.rating_count
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
  const {
    origin,
    originLat,
    originLng,
    destination,
    destinationLat,
    destinationLng,
    route,
    tripTime,
    availableSeats
  } = req.body;

  if (!origin || !destination || !tripTime || !availableSeats) {
    throw new HttpError(400, 'origin, destination, tripTime, and availableSeats are required.');
  }

  const requestedSeats = Number(availableSeats);

  if (!Number.isInteger(requestedSeats) || requestedSeats < 1) {
    throw new HttpError(400, 'availableSeats must be at least 1.');
  }

  const driverRows = await query(
    `SELECT available_seats
     FROM drivers
     WHERE driver_id = ?
     LIMIT 1`,
    [req.user.id]
  );

  if (!driverRows[0]) {
    throw new HttpError(404, 'Driver account not found.');
  }

  if (requestedSeats > Number(driverRows[0].available_seats)) {
    throw new HttpError(400, 'Trip seats cannot exceed the seats registered for this driver.');
  }

  await query(
    `UPDATE bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     SET b.booking_status = 'cancelled'
     WHERE t.driver_id = ?
       AND t.trip_status = 'active'
       AND b.booking_status IN ('pending', 'accepted', 'picked_up', 'payment_due')`,
    [req.user.id]
  );

  await query(
    `UPDATE trips
     SET trip_status = 'cancelled'
     WHERE driver_id = ?
       AND trip_status = 'active'`,
    [req.user.id]
  );

  const originLatitude = toNullableNumber(originLat);
  const originLongitude = toNullableNumber(originLng);
  const destinationLatitude = toNullableNumber(destinationLat);
  const destinationLongitude = toNullableNumber(destinationLng);

  const result = await query(
    `INSERT INTO trips
      (
        driver_id,
        origin,
        origin_lat,
        origin_lng,
        destination,
        destination_lat,
        destination_lng,
        driver_current_lat,
        driver_current_lng,
        last_location_at,
        route,
        trip_time,
        available_seats
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
    [
      req.user.id,
      origin,
      originLatitude,
      originLongitude,
      destination,
      destinationLatitude,
      destinationLongitude,
      originLatitude,
      originLongitude,
      route ?? null,
      tripTime,
      requestedSeats
    ]
  );

  res.status(201).json({
    message: 'Trip created.',
    tripId: result.insertId,
    trip: {
      trip_id: result.insertId,
      driver_id: req.user.id,
      origin,
      origin_lat: originLatitude,
      origin_lng: originLongitude,
      destination,
      destination_lat: destinationLatitude,
      destination_lng: destinationLongitude,
      driver_current_lat: originLatitude,
      driver_current_lng: originLongitude,
      route: route ?? null,
      trip_time: tripTime,
      available_seats: requestedSeats,
      trip_status: 'active'
    }
  });
});

export const updateTripLocation = asyncHandler(async (req, res) => {
  const latitude = toNullableNumber(req.body.lat);
  const longitude = toNullableNumber(req.body.lng);

  if (latitude === null || longitude === null) {
    throw new HttpError(400, 'lat and lng are required.');
  }

  const result = await query(
    `UPDATE trips
     SET driver_current_lat = ?,
         driver_current_lng = ?,
         last_location_at = NOW()
     WHERE trip_id = ?
       AND driver_id = ?
       AND trip_status = 'active'`,
    [latitude, longitude, req.params.tripId, req.user.id]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Active trip not found for this driver.');
  }

  res.json({ message: 'Trip location updated.' });
});

export const updateTripStatus = asyncHandler(async (req, res) => {
  const { tripStatus } = req.body;

  if (!tripStatus) {
    throw new HttpError(400, 'tripStatus is required.');
  }

  const params = [tripStatus, req.params.tripId];
  const ownerFilter = req.user.role === 'driver' ? ' AND driver_id = ?' : '';

  if (req.user.role === 'driver') {
    params.push(req.user.id);
  }

  const result = await query(`UPDATE trips SET trip_status = ? WHERE trip_id = ?${ownerFilter}`, params);

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Trip not found for this account.');
  }

  if (tripStatus === 'cancelled') {
    await query(
      `UPDATE bookings
       SET booking_status = 'cancelled'
       WHERE trip_id = ?
         AND booking_status IN ('pending', 'accepted', 'picked_up', 'payment_due')`,
      [req.params.tripId]
    );
  }

  res.json({ message: 'Trip status updated.' });
});
