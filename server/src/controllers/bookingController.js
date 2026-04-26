import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const listBookings = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT
       b.*,
       p.full_name AS passenger_name,
       t.origin,
       t.destination,
       d.full_name AS driver_name
     FROM bookings b
     JOIN passengers p ON p.passenger_id = b.passenger_id
     JOIN trips t ON t.trip_id = b.trip_id
     JOIN drivers d ON d.driver_id = t.driver_id
     ORDER BY b.booking_date DESC`
  );

  res.json({ bookings: rows });
});

export const createBooking = asyncHandler(async (req, res) => {
  const { tripId, pickupLocation, dropoffLocation, paymentAmount, paymentMethod } = req.body;

  if (!tripId || !pickupLocation || !dropoffLocation) {
    throw new HttpError(400, 'tripId, pickupLocation, and dropoffLocation are required.');
  }

  const result = await query(
    `INSERT INTO bookings
      (passenger_id, trip_id, pickup_location, dropoff_location, payment_amount, payment_method)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      tripId,
      pickupLocation,
      dropoffLocation,
      paymentAmount ?? 0,
      paymentMethod ?? 'cash'
    ]
  );

  res.status(201).json({
    message: 'Booking request created.',
    bookingId: result.insertId
  });
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  const { bookingStatus } = req.body;

  if (!bookingStatus) {
    throw new HttpError(400, 'bookingStatus is required.');
  }

  await query('UPDATE bookings SET booking_status = ? WHERE booking_id = ?', [
    bookingStatus,
    req.params.bookingId
  ]);

  res.json({ message: 'Booking status updated.' });
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { paymentStatus, paymentMethod } = req.body;

  if (!paymentStatus) {
    throw new HttpError(400, 'paymentStatus is required.');
  }

  await query('UPDATE bookings SET payment_status = ?, payment_method = COALESCE(?, payment_method) WHERE booking_id = ?', [
    paymentStatus,
    paymentMethod ?? null,
    req.params.bookingId
  ]);

  res.json({ message: 'Payment status updated.' });
});
