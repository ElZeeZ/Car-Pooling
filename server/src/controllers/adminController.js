import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const getAdminSummary = asyncHandler(async (req, res) => {
  const [drivers] = await query('SELECT COUNT(*) AS total FROM drivers');
  const [passengers] = await query('SELECT COUNT(*) AS total FROM passengers');
  const [activeTrips] = await query("SELECT COUNT(*) AS total FROM trips WHERE trip_status IN ('active', 'in_progress')");
  const [openReports] = await query("SELECT COUNT(*) AS total FROM reports WHERE report_status IN ('open', 'reviewing')");

  res.json({
    summary: {
      drivers: drivers.total,
      passengers: passengers.total,
      activeTrips: activeTrips.total,
      openReports: openReports.total
    }
  });
});

export const updateAccountStatus = asyncHandler(async (req, res) => {
  const { role, accountStatus } = req.body;
  const allowedTables = {
    driver: { table: 'drivers', idColumn: 'driver_id' },
    passenger: { table: 'passengers', idColumn: 'passenger_id' }
  };
  const config = allowedTables[role];

  if (!config || !accountStatus) {
    throw new HttpError(400, 'Valid role and accountStatus are required.');
  }

  await query(
    `UPDATE ${config.table} SET account_status = ? WHERE ${config.idColumn} = ?`,
    [accountStatus, req.params.accountId]
  );

  res.json({ message: 'Account status updated.' });
});
