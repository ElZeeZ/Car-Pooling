import { pool, query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const accountConfigByRole = {
  driver: {
    table: 'drivers',
    idColumn: 'driver_id',
    statusColumn: 'account_status'
  },
  passenger: {
    table: 'passengers',
    idColumn: 'passenger_id',
    statusColumn: 'account_status'
  }
};

const reportStatuses = new Set(['open', 'reviewing', 'resolved', 'dismissed']);
const accountStatuses = new Set(['pending', 'active', 'suspended']);

const getAccountConfig = (role) => {
  const config = accountConfigByRole[role];

  if (!config) {
    throw new HttpError(400, 'Valid account role is required.');
  }

  return config;
};

const getSummary = async () => {
  const rows = await query(
    `SELECT
       (SELECT COUNT(*)
        FROM drivers
        WHERE account_status = 'pending'
           OR verification_status = 'pending') AS pendingDrivers,
       (SELECT COUNT(*)
        FROM reports
        WHERE report_status IN ('open', 'reviewing')) AS openReports,
       (SELECT COUNT(*)
        FROM trips
        WHERE trip_status IN ('active', 'in_progress')) AS activeTrips,
       (SELECT COUNT(*)
        FROM bookings
        WHERE booking_status IN ('pending', 'accepted', 'picked_up', 'payment_due')) AS activeBookings,
       (SELECT COUNT(*) FROM drivers) AS totalDrivers,
       (SELECT COUNT(*) FROM passengers) AS totalPassengers`
  );

  return rows[0];
};

const getPendingDriverRows = () =>
  query(
    `SELECT
       driver_id,
       full_name,
       email,
       phone,
       license_number,
       verification_status,
       vehicle_info,
       available_seats,
       account_status,
       created_at,
       updated_at
     FROM drivers
     WHERE account_status = 'pending'
        OR verification_status = 'pending'
     ORDER BY created_at DESC`
  );

const getReportRows = (limitClause = '') =>
  query(
    `SELECT
       r.report_id,
       r.booking_id,
       r.passenger_id,
       r.driver_id,
       b.driver_rating AS rating,
       r.comment,
       r.report_type,
       r.report_date,
       r.report_status,
       p.full_name AS passenger_name,
       d.full_name AS driver_name,
       b.pickup_location,
       b.dropoff_location,
       b.payment_status,
       b.booking_status
     FROM reports r
     JOIN passengers p ON p.passenger_id = r.passenger_id
     JOIN drivers d ON d.driver_id = r.driver_id
     JOIN bookings b ON b.booking_id = r.booking_id
     ORDER BY
       CASE r.report_status
         WHEN 'open' THEN 1
         WHEN 'reviewing' THEN 2
         WHEN 'resolved' THEN 3
         ELSE 4
       END,
       r.report_date DESC
     ${limitClause}`
  );

export const getAdminSummary = asyncHandler(async (req, res) => {
  const summary = await getSummary();
  res.json({ summary });
});

export const getAdminDashboard = asyncHandler(async (req, res) => {
  const [summary, pendingDrivers, reports] = await Promise.all([
    getSummary(),
    getPendingDriverRows(),
    getReportRows('LIMIT 8')
  ]);

  res.json({
    summary,
    pendingDrivers,
    reports
  });
});

export const listPendingDrivers = asyncHandler(async (req, res) => {
  const pendingDrivers = await getPendingDriverRows();
  res.json({ pendingDrivers });
});

export const verifyDriver = asyncHandler(async (req, res) => {
  const driverId = Number(req.params.driverId);

  if (!Number.isInteger(driverId) || driverId < 1) {
    throw new HttpError(400, 'driverId must be a valid driver reference.');
  }

  const result = await query(
    `UPDATE drivers
     SET verification_status = 'verified',
         account_status = 'active'
     WHERE driver_id = ?`,
    [driverId]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Driver account request was not found.');
  }

  const rows = await query(
    `SELECT
       driver_id,
       full_name,
       email,
       phone,
       license_number,
       verification_status,
       vehicle_info,
       available_seats,
       account_status,
       created_at,
       updated_at
     FROM drivers
     WHERE driver_id = ?
     LIMIT 1`,
    [driverId]
  );

  res.json({
    message: 'Driver verified and activated.',
    driver: rows[0]
  });
});

export const rejectDriver = asyncHandler(async (req, res) => {
  const driverId = Number(req.params.driverId);

  if (!Number.isInteger(driverId) || driverId < 1) {
    throw new HttpError(400, 'driverId must be a valid driver reference.');
  }

  const result = await query(
    `UPDATE drivers
     SET verification_status = 'rejected',
         account_status = 'suspended'
     WHERE driver_id = ?
       AND verification_status = 'pending'`,
    [driverId]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Pending driver account request was not found.');
  }

  res.json({ message: 'Driver request rejected.' });
});

export const listAccounts = asyncHandler(async (req, res) => {
  const accounts = await query(
    `SELECT *
     FROM (
       SELECT
         'driver' AS role,
         driver_id AS id,
         full_name,
         email,
         phone,
         account_status,
         verification_status,
         license_number,
         vehicle_info,
         available_seats,
         created_at,
         updated_at
       FROM drivers
       WHERE verification_status = 'verified'
         AND account_status IN ('active', 'suspended')
       UNION ALL
       SELECT
         'passenger' AS role,
         passenger_id AS id,
         full_name,
         email,
         phone,
         account_status,
         NULL AS verification_status,
         NULL AS license_number,
         NULL AS vehicle_info,
         NULL AS available_seats,
         created_at,
         updated_at
       FROM passengers
     ) accounts
     ORDER BY created_at DESC`
  );

  res.json({ accounts });
});

export const updateAccountStatus = asyncHandler(async (req, res) => {
  const role = req.params.role ?? req.body.role;
  const accountStatus = req.body.accountStatus;
  const config = getAccountConfig(role);

  if (!accountStatuses.has(accountStatus)) {
    throw new HttpError(400, 'Valid accountStatus is required.');
  }

  if (role === 'passenger' && accountStatus === 'pending') {
    throw new HttpError(400, 'Passenger accounts cannot be moved to pending status.');
  }

  const accountId = Number(req.params.accountId);

  if (!Number.isInteger(accountId) || accountId < 1) {
    throw new HttpError(400, 'accountId must be a valid account reference.');
  }

  if (role === 'driver') {
    if (accountStatus === 'pending') {
      throw new HttpError(400, 'Verified drivers cannot be moved back to pending here.');
    }

    const result = await query(
      `UPDATE drivers
       SET account_status = ?,
           verification_status = 'verified'
       WHERE driver_id = ?
         AND verification_status = 'verified'`,
      [accountStatus, accountId]
    );

    if (result.affectedRows === 0) {
      throw new HttpError(404, 'Verified driver account was not found.');
    }
  } else {
    const result = await query(
      `UPDATE ${config.table}
       SET ${config.statusColumn} = ?
       WHERE ${config.idColumn} = ?`,
      [accountStatus, accountId]
    );

    if (result.affectedRows === 0) {
      throw new HttpError(404, 'Passenger account was not found.');
    }
  }

  res.json({ message: 'Account status updated.' });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const role = req.params.role;
  const accountId = Number(req.params.accountId);
  const config = getAccountConfig(role);

  if (!Number.isInteger(accountId) || accountId < 1) {
    throw new HttpError(400, 'accountId must be a valid account reference.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM payment_cards
       WHERE owner_type = ? AND owner_id = ?`,
      [role, accountId]
    );
    await connection.execute(
      `DELETE FROM wallet_accounts
       WHERE owner_type = ? AND owner_id = ?`,
      [role, accountId]
    );
    const [result] = await connection.execute(
      `DELETE FROM ${config.table}
       WHERE ${config.idColumn} = ?`,
      [accountId]
    );

    if (result.affectedRows === 0) {
      throw new HttpError(404, 'Account was not found.');
    }

    await connection.commit();
    res.json({ message: 'Account deleted.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export const listAdminReports = asyncHandler(async (req, res) => {
  const reports = await getReportRows();
  res.json({ reports });
});

export const updateAdminReportStatus = asyncHandler(async (req, res) => {
  const reportId = Number(req.params.reportId);
  const { reportStatus } = req.body;

  if (!Number.isInteger(reportId) || reportId < 1) {
    throw new HttpError(400, 'reportId must be a valid report reference.');
  }

  if (!reportStatuses.has(reportStatus)) {
    throw new HttpError(400, 'Valid reportStatus is required.');
  }

  const result = await query('UPDATE reports SET report_status = ? WHERE report_id = ?', [
    reportStatus,
    reportId
  ]);

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Report was not found.');
  }

  res.json({ message: 'Report status updated.' });
});

export const listAdminTrips = asyncHandler(async (req, res) => {
  const trips = await query(
    `SELECT
       t.trip_id,
       t.driver_id,
       d.full_name AS driver_name,
       t.origin,
       t.destination,
       t.route,
       t.trip_time,
       t.available_seats,
       t.trip_status,
       t.driver_current_lat,
       t.driver_current_lng,
       t.last_location_at,
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
     ORDER BY t.trip_time DESC
     LIMIT 120`
  );

  res.json({ trips });
});

export const listAdminTransactions = asyncHandler(async (req, res) => {
  const transactions = await query(
    `SELECT
       wt.transaction_id,
       wt.booking_id,
       wt.transaction_type,
       wt.amount,
       wt.description,
       wt.created_at,
       wa.owner_type,
       wa.owner_id,
       CASE
         WHEN wa.owner_type = 'driver' THEN d.full_name
         ELSE p.full_name
       END AS owner_name
     FROM wallet_transactions wt
     JOIN wallet_accounts wa ON wa.wallet_id = wt.wallet_id
     LEFT JOIN drivers d ON wa.owner_type = 'driver' AND d.driver_id = wa.owner_id
     LEFT JOIN passengers p ON wa.owner_type = 'passenger' AND p.passenger_id = wa.owner_id
     ORDER BY wt.created_at DESC
     LIMIT 120`
  );

  res.json({ transactions });
});
