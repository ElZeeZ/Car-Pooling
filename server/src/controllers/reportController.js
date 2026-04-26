import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

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
  const { bookingId, passengerId, driverId, rating, comment, reportType } = req.body;

  if (!bookingId || !passengerId || !driverId || !reportType) {
    throw new HttpError(400, 'bookingId, passengerId, driverId, and reportType are required.');
  }

  const result = await query(
    `INSERT INTO reports
      (booking_id, passenger_id, driver_id, rating, comment, report_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [bookingId, passengerId, driverId, rating ?? null, comment ?? null, reportType]
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
