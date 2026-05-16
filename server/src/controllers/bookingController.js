import { pool, query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const slugify = (value) =>
  String(value ?? 'passenger')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'passenger';

const toNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalDriverRating = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new HttpError(400, 'Driver rating must be a whole number from 1 to 5.');
  }

  return parsed;
};

const refreshDriverRatingWithConnection = async (connection, driverId) => {
  const [ratingRows] = await connection.execute(
    `SELECT AVG(driver_rating) AS average_rating, COUNT(driver_rating) AS rating_count
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     WHERE t.driver_id = ?
       AND b.driver_rating IS NOT NULL`,
    [driverId]
  );
  const ratingCount = Number(ratingRows[0]?.rating_count ?? 0);
  const ratingAverage = ratingCount > 0 ? Number(ratingRows[0].average_rating).toFixed(2) : null;

  await connection.execute(
    `UPDATE drivers
     SET rating_average = ?, rating_count = ?
     WHERE driver_id = ?`,
    [ratingAverage, ratingCount, driverId]
  );
};

const refreshDriverRating = async (driverId) => {
  const ratingRows = await query(
    `SELECT AVG(b.driver_rating) AS average_rating, COUNT(b.driver_rating) AS rating_count
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     WHERE t.driver_id = ?
       AND b.driver_rating IS NOT NULL`,
    [driverId]
  );
  const ratingCount = Number(ratingRows[0]?.rating_count ?? 0);
  const ratingAverage = ratingCount > 0 ? Number(ratingRows[0].average_rating).toFixed(2) : null;

  await query(
    `UPDATE drivers
     SET rating_average = ?, rating_count = ?
     WHERE driver_id = ?`,
    [ratingAverage, ratingCount, driverId]
  );
};

const ensureDemoPassenger = async ({ passengerId, passengerName, passengerEmail, requestId }) => {
  if (passengerId) {
    const rows = await query('SELECT passenger_id, full_name FROM passengers WHERE passenger_id = ? LIMIT 1', [
      passengerId
    ]);

    if (!rows[0]) {
      throw new HttpError(404, 'Passenger not found.');
    }

    return rows[0];
  }

  const safeEmail =
    passengerEmail ?? `request-${requestId ?? Date.now()}-${slugify(passengerName)}@carpool.local`;
  const existing = await query('SELECT passenger_id, full_name FROM passengers WHERE email = ? LIMIT 1', [
    safeEmail
  ]);

  if (existing[0]) {
    return existing[0];
  }

  const result = await query(
    `INSERT INTO passengers (full_name, email, phone, password_hash)
     VALUES (?, ?, ?, ?)`,
    [passengerName ?? 'Passenger request', safeEmail, '00000000', 'request-created-by-driver']
  );

  return {
    passenger_id: result.insertId,
    full_name: passengerName ?? 'Passenger request'
  };
};

const assertDriverOwnsBooking = async (bookingId, driverId) => {
  const rows = await query(
    `SELECT b.booking_id
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     WHERE b.booking_id = ? AND t.driver_id = ?
     LIMIT 1`,
    [bookingId, driverId]
  );

  if (!rows[0]) {
    throw new HttpError(404, 'Booking not found for this driver.');
  }
};

const assertPassengerOwnsBooking = async (bookingId, passengerId) => {
  const rows = await query(
    `SELECT booking_id
     FROM bookings
     WHERE booking_id = ? AND passenger_id = ?
     LIMIT 1`,
    [bookingId, passengerId]
  );

  if (!rows[0]) {
    throw new HttpError(404, 'Booking not found for this passenger.');
  }
};

export const listBookings = asyncHandler(async (req, res) => {
  const params = [];
  let filter = '';

  if (req.user.role === 'driver') {
    filter = 'WHERE t.driver_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'passenger') {
    filter = 'WHERE b.passenger_id = ?';
    params.push(req.user.id);
  }

  const rows = await query(
    `SELECT
       b.booking_id,
       b.passenger_id,
       b.trip_id,
       b.pickup_location,
       b.pickup_lat,
       b.pickup_lng,
       b.dropoff_location,
       b.dropoff_lat,
       b.dropoff_lng,
       b.seats_requested,
       b.booking_status,
       b.booking_date,
       b.passenger_trip_km,
       b.pickup_detour_km,
       b.payment_base_amount,
       b.payment_detour_amount,
       b.payment_amount,
       b.payment_method,
       b.payment_status,
       p.full_name AS passenger_name,
       t.origin,
       t.destination,
       t.destination_lat,
       t.destination_lng,
       t.driver_current_lat,
       t.driver_current_lng,
       d.full_name AS driver_name,
       d.vehicle_info,
       d.license_number,
       d.profile_image,
       d.rating_average,
       d.rating_count
     FROM bookings b
     JOIN passengers p ON p.passenger_id = b.passenger_id
     JOIN trips t ON t.trip_id = b.trip_id
     JOIN drivers d ON d.driver_id = t.driver_id
     ${filter}
     ORDER BY b.booking_date DESC`
    ,
    params
  );

  res.json({ bookings: rows });
});

export const createBooking = asyncHandler(async (req, res) => {
  const {
    tripId,
    pickupLocation,
    pickupLat,
    pickupLng,
    dropoffLocation,
    dropoffLat,
    dropoffLng,
    paymentAmount,
    paymentMethod,
    seatsRequested,
    passengerTripKm,
    pickupDetourKm,
    paymentBaseAmount,
    paymentDetourAmount
  } = req.body;

  if (!tripId || !pickupLocation || !dropoffLocation) {
    throw new HttpError(400, 'tripId, pickupLocation, and dropoffLocation are required.');
  }

  const requestedSeats = Number(seatsRequested ?? 1);
  const pickupLatitude = toNullableNumber(pickupLat);
  const pickupLongitude = toNullableNumber(pickupLng);
  const dropoffLatitude = toNullableNumber(dropoffLat);
  const dropoffLongitude = toNullableNumber(dropoffLng);

  if (!Number.isInteger(requestedSeats) || requestedSeats < 1 || requestedSeats > 8) {
    throw new HttpError(400, 'seatsRequested must be between 1 and 8.');
  }

  const trips = await query(
    `SELECT trip_id, available_seats, trip_status
     FROM trips
     WHERE trip_id = ?
     LIMIT 1`,
    [tripId]
  );

  if (!trips[0]) {
    throw new HttpError(404, 'Trip not found.');
  }

  if (trips[0].trip_status !== 'active') {
    throw new HttpError(400, 'This trip is not accepting bookings.');
  }

  if (requestedSeats > Number(trips[0].available_seats)) {
    throw new HttpError(400, 'Requested seats exceed this trip availability.');
  }

  const existingLiveBookings = await query(
    `SELECT booking_id
     FROM bookings
     WHERE passenger_id = ?
       AND booking_status IN ('pending', 'accepted', 'picked_up', 'payment_due')
     LIMIT 1`,
    [req.user.id]
  );

  if (existingLiveBookings[0]) {
    throw new HttpError(400, 'You already have an active booking.');
  }

  const result = await query(
    `INSERT INTO bookings
      (
        passenger_id,
        trip_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        dropoff_location,
        dropoff_lat,
        dropoff_lng,
        seats_requested,
        passenger_trip_km,
        pickup_detour_km,
        payment_base_amount,
        payment_detour_amount,
        payment_amount,
        payment_method
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      tripId,
      pickupLocation,
      pickupLatitude,
      pickupLongitude,
      dropoffLocation,
      dropoffLatitude,
      dropoffLongitude,
      requestedSeats,
      passengerTripKm ?? 0,
      pickupDetourKm ?? 0,
      paymentBaseAmount ?? 0,
      paymentDetourAmount ?? 0,
      paymentAmount ?? 0,
      paymentMethod ?? 'cash'
    ]
  );

  res.status(201).json({
    message: 'Booking request created.',
    bookingId: result.insertId
  });
});

export const createDriverAcceptedBooking = asyncHandler(async (req, res) => {
  const {
    tripId,
    passengerId,
    passengerName,
    passengerEmail,
    requestId,
    pickupLocation,
    pickupLat,
    pickupLng,
    dropoffLocation,
    dropoffLat,
    dropoffLng,
    paymentAmount,
    paymentMethod,
    seatsRequested,
    passengerTripKm,
    pickupDetourKm,
    paymentBaseAmount,
    paymentDetourAmount
  } = req.body;

  if (!tripId || !pickupLocation || !dropoffLocation || (!passengerId && !passengerName)) {
    throw new HttpError(
      400,
      'tripId, passenger, pickupLocation, and dropoffLocation are required.'
    );
  }

  const requestedSeats = Number(seatsRequested ?? 1);
  const pickupLatitude = toNullableNumber(pickupLat);
  const pickupLongitude = toNullableNumber(pickupLng);
  const dropoffLatitude = toNullableNumber(dropoffLat);
  const dropoffLongitude = toNullableNumber(dropoffLng);

  if (!Number.isInteger(requestedSeats) || requestedSeats < 1 || requestedSeats > 8) {
    throw new HttpError(400, 'seatsRequested must be between 1 and 8.');
  }

  const trips = await query(
    `SELECT trip_id, destination, available_seats, trip_status
     FROM trips
     WHERE trip_id = ? AND driver_id = ?
     LIMIT 1`,
    [tripId, req.user.id]
  );

  if (!trips[0]) {
    throw new HttpError(404, 'Trip not found for this driver.');
  }

  if (trips[0].trip_status !== 'active') {
    throw new HttpError(400, 'This trip is not accepting bookings.');
  }

  if (requestedSeats > Number(trips[0].available_seats)) {
    throw new HttpError(400, 'Requested seats exceed this trip availability.');
  }

  const passenger = await ensureDemoPassenger({
    passengerId,
    passengerName,
    passengerEmail,
    requestId
  });

  const result = await query(
    `INSERT INTO bookings
      (
        passenger_id,
        trip_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        dropoff_location,
        dropoff_lat,
        dropoff_lng,
        seats_requested,
        booking_status,
        passenger_trip_km,
        pickup_detour_km,
        payment_base_amount,
        payment_detour_amount,
        payment_amount,
        payment_method
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?)`,
    [
      passenger.passenger_id,
      tripId,
      pickupLocation,
      pickupLatitude,
      pickupLongitude,
      dropoffLocation,
      dropoffLatitude,
      dropoffLongitude,
      requestedSeats,
      passengerTripKm ?? 0,
      pickupDetourKm ?? 0,
      paymentBaseAmount ?? 0,
      paymentDetourAmount ?? 0,
      paymentAmount ?? 0,
      paymentMethod ?? 'cash'
    ]
  );

  res.status(201).json({
    message: 'Booking accepted.',
    booking: {
      booking_id: result.insertId,
      passenger_id: passenger.passenger_id,
      passenger_name: passenger.full_name,
      trip_id: tripId,
      pickup_location: pickupLocation,
      pickup_lat: pickupLatitude,
      pickup_lng: pickupLongitude,
      dropoff_location: dropoffLocation,
      dropoff_lat: dropoffLatitude,
      dropoff_lng: dropoffLongitude,
      seats_requested: requestedSeats,
      booking_status: 'accepted',
      payment_amount: paymentAmount ?? 0,
      payment_method: paymentMethod ?? 'cash',
      payment_status: 'pending'
    }
  });
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  const {
    bookingStatus,
    passengerTripKm,
    pickupDetourKm,
    paymentBaseAmount,
    paymentDetourAmount,
    paymentAmount,
    paymentMethod
  } = req.body;

  if (!bookingStatus) {
    throw new HttpError(400, 'bookingStatus is required.');
  }

  if (req.user.role === 'driver') {
    await assertDriverOwnsBooking(req.params.bookingId, req.user.id);
  } else if (req.user.role === 'passenger') {
    if (bookingStatus !== 'cancelled') {
      throw new HttpError(403, 'Passengers can only cancel their own booking requests.');
    }

    await assertPassengerOwnsBooking(req.params.bookingId, req.user.id);
  }

  const result = await query(
    `UPDATE bookings
     SET booking_status = ?,
         passenger_trip_km = COALESCE(?, passenger_trip_km),
         pickup_detour_km = COALESCE(?, pickup_detour_km),
         payment_base_amount = COALESCE(?, payment_base_amount),
         payment_detour_amount = COALESCE(?, payment_detour_amount),
         payment_amount = COALESCE(?, payment_amount),
         payment_method = COALESCE(?, payment_method)
     WHERE booking_id = ?`,
    [
      bookingStatus,
      toNullableNumber(passengerTripKm),
      toNullableNumber(pickupDetourKm),
      toNullableNumber(paymentBaseAmount),
      toNullableNumber(paymentDetourAmount),
      toNullableNumber(paymentAmount),
      paymentMethod ?? null,
      req.params.bookingId
    ]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Booking not found.');
  }

  if (bookingStatus === 'accepted') {
    const rows = await query('SELECT trip_id, passenger_id FROM bookings WHERE booking_id = ? LIMIT 1', [
      req.params.bookingId
    ]);

    if (rows[0]) {
      await query(
        `UPDATE bookings
         SET booking_status = 'rejected'
         WHERE trip_id = ?
         AND booking_id <> ?
           AND booking_status = 'pending'`,
        [rows[0].trip_id, req.params.bookingId]
      );
      await query(
        `UPDATE bookings
         SET booking_status = 'cancelled'
         WHERE passenger_id = ?
           AND booking_id <> ?
           AND booking_status = 'pending'`,
        [rows[0].passenger_id, req.params.bookingId]
      );
    }
  }

  res.json({ message: 'Booking status updated.' });
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { paymentStatus, paymentMethod, driverRating } = req.body;
  const parsedDriverRating = parseOptionalDriverRating(driverRating);

  if (!paymentStatus) {
    throw new HttpError(400, 'paymentStatus is required.');
  }

  if (req.user.role === 'driver') {
    await assertDriverOwnsBooking(req.params.bookingId, req.user.id);
  } else if (req.user.role === 'passenger') {
    await assertPassengerOwnsBooking(req.params.bookingId, req.user.id);
  }

  if (paymentMethod === 'cash' && paymentStatus === 'cash_pending') {
    if (req.user.role !== 'passenger') {
      throw new HttpError(403, 'Only passengers can select cash payment.');
    }

    const result = await query(
      `UPDATE bookings
       SET payment_status = 'cash_pending',
           payment_method = 'cash',
           driver_rating = COALESCE(?, driver_rating)
       WHERE booking_id = ?
         AND booking_status = 'payment_due'`,
      [parsedDriverRating, req.params.bookingId]
    );

    if (result.affectedRows === 0) {
      throw new HttpError(404, 'Payment due booking not found.');
    }

    res.json({ message: 'Cash payment selected. Waiting for driver confirmation.' });
    return;
  }

  if (paymentMethod === 'card' && paymentStatus === 'paid') {
    if (req.user.role !== 'passenger') {
      throw new HttpError(403, 'Card wallet payments must be made by the passenger.');
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [bookingRows] = await connection.execute(
        `SELECT
           b.booking_id,
           b.passenger_id,
           b.payment_amount,
           b.payment_status,
           t.driver_id
         FROM bookings b
         JOIN trips t ON t.trip_id = b.trip_id
         WHERE b.booking_id = ?
         LIMIT 1
         FOR UPDATE`,
        [req.params.bookingId]
      );
      const booking = bookingRows[0];

      if (!booking) {
        throw new HttpError(404, 'Booking not found.');
      }

      if (booking.payment_status === 'paid') {
        await connection.commit();
        res.json({ message: 'Payment was already completed.' });
        return;
      }

      const amount = Number(booking.payment_amount ?? 0);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new HttpError(400, 'Booking payment amount is invalid.');
      }

      const [passengerWalletRows] = await connection.execute(
        `SELECT wallet_id, balance
         FROM wallet_accounts
         WHERE owner_type = 'passenger' AND owner_id = ?
         LIMIT 1
         FOR UPDATE`,
        [booking.passenger_id]
      );
      const passengerWallet = passengerWalletRows[0];

      if (!passengerWallet || Number(passengerWallet.balance) < amount) {
        throw new HttpError(400, 'Insufficient funds. Choose cash or top up your wallet.');
      }

      const [driverWalletRows] = await connection.execute(
        `SELECT wallet_id, balance
         FROM wallet_accounts
         WHERE owner_type = 'driver' AND owner_id = ?
         LIMIT 1
         FOR UPDATE`,
        [booking.driver_id]
      );
      let driverWallet = driverWalletRows[0];

      if (!driverWallet) {
        const [driverWalletResult] = await connection.execute(
          `INSERT INTO wallet_accounts (owner_type, owner_id, balance)
           VALUES ('driver', ?, 0.00)`,
          [booking.driver_id]
        );
        driverWallet = { wallet_id: driverWalletResult.insertId };
      }

      await connection.execute('UPDATE wallet_accounts SET balance = balance - ? WHERE wallet_id = ?', [
        amount,
        passengerWallet.wallet_id
      ]);
      await connection.execute('UPDATE wallet_accounts SET balance = balance + ? WHERE wallet_id = ?', [
        amount,
        driverWallet.wallet_id
      ]);
      await connection.execute(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, transaction_type, amount, description)
         VALUES (?, ?, 'fare_payment', ?, ?)`,
        [passengerWallet.wallet_id, req.params.bookingId, amount, `Card fare payment for booking #${req.params.bookingId}`]
      );
      await connection.execute(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, transaction_type, amount, description)
         VALUES (?, ?, 'fare_payout', ?, ?)`,
        [driverWallet.wallet_id, req.params.bookingId, amount, `Card fare payout for booking #${req.params.bookingId}`]
      );
      await connection.execute(
        `UPDATE bookings
         SET payment_status = 'paid',
             payment_method = 'card',
             booking_status = 'completed',
             driver_rating = COALESCE(?, driver_rating)
         WHERE booking_id = ?`,
        [parsedDriverRating, req.params.bookingId]
      );
      await refreshDriverRatingWithConnection(connection, booking.driver_id);
      await connection.execute('DELETE FROM messages WHERE booking_id = ?', [req.params.bookingId]);
      await connection.commit();

      res.json({ message: 'Card payment completed.' });
      return;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  if (paymentStatus === 'paid') {
    const result = await query(
      `UPDATE bookings
       SET payment_status = 'paid',
           payment_method = COALESCE(?, payment_method),
           booking_status = 'completed',
           driver_rating = COALESCE(?, driver_rating)
       WHERE booking_id = ?`,
      [paymentMethod ?? null, parsedDriverRating, req.params.bookingId]
    );

    if (result.affectedRows === 0) {
      throw new HttpError(404, 'Booking not found.');
    }

    await query('DELETE FROM messages WHERE booking_id = ?', [req.params.bookingId]);
    const driverRows = await query(
      `SELECT t.driver_id
       FROM bookings b
       JOIN trips t ON t.trip_id = b.trip_id
       WHERE b.booking_id = ?
       LIMIT 1`,
      [req.params.bookingId]
    );

    if (driverRows[0]) {
      await refreshDriverRating(driverRows[0].driver_id);
    }

    res.json({ message: 'Payment status updated.' });
    return;
  }

  const result = await query(
    `UPDATE bookings
     SET payment_status = ?,
         payment_method = COALESCE(?, payment_method)
     WHERE booking_id = ?`,
    [paymentStatus, paymentMethod ?? null, req.params.bookingId]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Booking not found.');
  }

  res.json({ message: 'Payment status updated.' });
});
