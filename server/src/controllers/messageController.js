import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const bookingAccessFilter = (user) => {
  if (user.role === 'driver') {
    return {
      sql: 't.driver_id = ?',
      params: [user.id]
    };
  }

  if (user.role === 'passenger') {
    return {
      sql: 'b.passenger_id = ?',
      params: [user.id]
    };
  }

  return {
    sql: '1 = 1',
    params: []
  };
};

const activeMessagingStatuses = "('accepted', 'picked_up', 'payment_due')";

export const listMessageConversations = asyncHandler(async (req, res) => {
  const access = bookingAccessFilter(req.user);
  const activeConversationFilter =
    req.user.role === 'admin'
      ? `EXISTS (
          SELECT 1
          FROM messages history_messages
          WHERE history_messages.booking_id = b.booking_id
        )`
      : `b.booking_status IN ${activeMessagingStatuses} AND t.trip_status = 'active'`;
  const limitSql = req.user.role === 'admin' ? '' : 'LIMIT 1';
  const rows = await query(
    `SELECT
       b.booking_id,
       b.booking_status,
       b.pickup_location,
       b.dropoff_location,
       p.full_name AS passenger_name,
       d.full_name AS driver_name,
       t.origin,
       t.destination
     FROM bookings b
     JOIN passengers p ON p.passenger_id = b.passenger_id
     JOIN trips t ON t.trip_id = b.trip_id
     JOIN drivers d ON d.driver_id = t.driver_id
     WHERE ${access.sql}
       AND ${activeConversationFilter}
     ORDER BY b.booking_date DESC
     ${limitSql}`,
    access.params
  );

  res.json({ conversations: rows });
});

export const listMessagesByBooking = asyncHandler(async (req, res) => {
  const access = bookingAccessFilter(req.user);
  const activeConversationFilter =
    req.user.role === 'admin'
      ? '1 = 1'
      : `b.booking_status IN ${activeMessagingStatuses} AND t.trip_status = 'active'`;
  const bookingRows = await query(
    `SELECT b.booking_id
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     WHERE b.booking_id = ?
       AND ${access.sql}
       AND ${activeConversationFilter}
     LIMIT 1`,
    [req.params.bookingId, ...access.params]
  );

  if (!bookingRows[0]) {
    throw new HttpError(404, 'Active booking conversation not found.');
  }

  const rows = await query(
    `SELECT message_id, booking_id, sender_type, message_text, sent_time
     FROM messages
     WHERE booking_id = ?
     ORDER BY sent_time ASC`,
    [req.params.bookingId]
  );

  res.json({ messages: rows });
});

export const createMessage = asyncHandler(async (req, res) => {
  const { bookingId, messageText } = req.body;

  if (!bookingId || !messageText) {
    throw new HttpError(400, 'bookingId and messageText are required.');
  }

  const access = bookingAccessFilter(req.user);
  const activeConversationFilter =
    req.user.role === 'admin'
      ? `b.booking_status IN ${activeMessagingStatuses}`
      : `b.booking_status IN ${activeMessagingStatuses} AND t.trip_status = 'active'`;
  const bookingRows = await query(
    `SELECT b.booking_id
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     WHERE b.booking_id = ?
       AND ${access.sql}
       AND ${activeConversationFilter}
     LIMIT 1`,
    [bookingId, ...access.params]
  );

  if (!bookingRows[0]) {
    throw new HttpError(404, 'Active booking conversation not found.');
  }

  const result = await query(
    'INSERT INTO messages (booking_id, sender_type, message_text) VALUES (?, ?, ?)',
    [bookingId, req.user.role, messageText]
  );

  res.status(201).json({
    message: 'Message sent.',
    messageId: result.insertId
  });
});
