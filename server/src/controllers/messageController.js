import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const listMessagesByBooking = asyncHandler(async (req, res) => {
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

  const result = await query(
    'INSERT INTO messages (booking_id, sender_type, message_text) VALUES (?, ?, ?)',
    [bookingId, req.user.role, messageText]
  );

  res.status(201).json({
    message: 'Message sent.',
    messageId: result.insertId
  });
});
