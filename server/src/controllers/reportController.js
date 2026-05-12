import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const reportTypesByRole = {
  driver: new Set(['safety', 'payment', 'other']),
  passenger: new Set(['safety', 'payment', 'other'])
};

export const listReports = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT
       r.*,
       p.full_name AS passenger_name,
       d.full_name AS driver_name
     FROM reports r
     JOIN passengers p ON p.passenger_id = r.passenger_id
     JOIN drivers d ON d.driver_id = r.driver_id
     ORDER BY r.report_date DESC`
  );

  res.json({ reports: rows });
});

export const createReport = asyncHandler(async (req, res) => {
  const { bookingId, comment, reportType } = req.body;
  const parsedBookingId = Number(bookingId);

  if (!Number.isInteger(parsedBookingId) || parsedBookingId < 1 || !reportType) {
    throw new HttpError(400, 'bookingId and reportType are required.');
  }

  if (!reportTypesByRole[req.user.role]?.has(reportType)) {
    throw new HttpError(400, 'This report type is not allowed for your account role.');
  }

  const accessFilter =
    req.user.role === 'driver'
      ? 'AND t.driver_id = ?'
      : req.user.role === 'passenger'
        ? 'AND b.passenger_id = ?'
        : '';
  const accessParams = req.user.role === 'admin' ? [] : [req.user.id];
  const bookings = await query(
    `SELECT b.booking_id, b.passenger_id, t.driver_id
     FROM bookings b
     JOIN trips t ON t.trip_id = b.trip_id
     WHERE b.booking_id = ?
     ${accessFilter}
     LIMIT 1`,
    [parsedBookingId, ...accessParams]
  );

  if (!bookings[0]) {
    throw new HttpError(404, 'Booking not found for this account.');
  }

  const result = await query(
    `INSERT INTO reports
      (booking_id, passenger_id, driver_id, comment, report_type)
     VALUES (?, ?, ?, ?, ?)`,
    [
      parsedBookingId,
      bookings[0].passenger_id,
      bookings[0].driver_id,
      comment ?? null,
      reportType
    ]
  );

  res.status(201).json({
    message: 'Report submitted.',
    reportId: result.insertId
  });
});

export const updateReportStatus = asyncHandler(async (req, res) => {
  const { reportStatus } = req.body;

  if (!reportStatus) {
    throw new HttpError(400, 'reportStatus is required.');
  }

  await query('UPDATE reports SET report_status = ? WHERE report_id = ?', [
    reportStatus,
    req.params.reportId
  ]);

  res.json({ message: 'Report status updated.' });
});
