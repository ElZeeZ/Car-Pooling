import { pool, query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { findUserByIdAndRole, sanitizeUser } from '../models/userModel.js';

const PHONE_PATTERN = /^\d+$/;
const LICENSE_PLATE_PATTERN = /^[A-Z]\d{1,7}$/;
const PROFILE_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
const MAX_PROFILE_IMAGE_LENGTH = 1_500_000;

const validatePhone = (phone) => {
  if (!PHONE_PATTERN.test(String(phone))) {
    throw new HttpError(400, 'Phone number must contain numbers only.');
  }
};

const normalizeLicensePlate = (licenseNumber) => String(licenseNumber ?? '').trim().toUpperCase();

const validateLicensePlate = (licenseNumber) => {
  if (!LICENSE_PLATE_PATTERN.test(licenseNumber)) {
    throw new HttpError(400, 'Car license plate must be one letter followed by 1 to 7 numbers.');
  }
};

const validateSeats = (availableSeats) => {
  const seats = Number(availableSeats);

  if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
    throw new HttpError(400, 'Available seats must be between 1 and 8.');
  }

  return seats;
};

const validateProfileImage = (profileImage) => {
  if (profileImage === null || profileImage === undefined || profileImage === '') {
    return null;
  }

  if (
    typeof profileImage !== 'string' ||
    profileImage.length > MAX_PROFILE_IMAGE_LENGTH ||
    !PROFILE_IMAGE_PATTERN.test(profileImage)
  ) {
    throw new HttpError(400, 'Profile picture must be a PNG, JPEG, or WEBP image under 1.5 MB.');
  }

  return profileImage.replace(/\s/g, '');
};

const formatSqlDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const getVehiclesForDriver = (driverId) =>
  query(
    `SELECT vehicle_id, driver_id, license_number, vehicle_info, available_seats, is_active, created_at, updated_at
     FROM driver_vehicles
     WHERE driver_id = ?
     ORDER BY is_active DESC, created_at DESC`,
    [driverId]
  );

const getAccountPayload = async (user) => {
  const account = await findUserByIdAndRole(user.id, user.role);

  if (!account) {
    throw new HttpError(404, 'Account was not found.');
  }

  const payload = {
    user: sanitizeUser(account, user.role)
  };

  if (user.role === 'driver') {
    payload.vehicles = await getVehiclesForDriver(user.id);
  }

  return payload;
};

export const getAccount = asyncHandler(async (req, res) => {
  res.json(await getAccountPayload(req.user));
});

export const updateProfile = asyncHandler(async (req, res) => {
  if (!['driver', 'passenger'].includes(req.user.role)) {
    throw new HttpError(403, 'Account settings are available for drivers and passengers.');
  }

  const phone = String(req.body.phone ?? '').trim();

  if (!phone) {
    throw new HttpError(400, 'Phone is required.');
  }

  validatePhone(phone);

  const account = await findUserByIdAndRole(req.user.id, req.user.role);

  if (!account) {
    throw new HttpError(404, 'Account was not found.');
  }

  if (req.user.role === 'driver') {
    const birthDate = formatSqlDate(account.birth_date);
    const profileImage =
      req.body.profileImage === undefined ? account.profile_image ?? null : validateProfileImage(req.body.profileImage);

    await query(
      `UPDATE drivers
       SET full_name = ?, phone = ?, birth_date = ?, profile_image = ?
       WHERE driver_id = ?`,
      [account.full_name, phone, birthDate, profileImage, req.user.id]
    );
  } else {
    await query(
      `UPDATE passengers
       SET full_name = ?, phone = ?
       WHERE passenger_id = ?`,
      [account.full_name, phone, req.user.id]
    );
  }

  res.json(await getAccountPayload(req.user));
});

export const updatePassword = asyncHandler(async (req, res) => {
  const currentPassword = String(req.body.currentPassword ?? '');
  const newPassword = String(req.body.newPassword ?? '');

  if (!currentPassword || !newPassword) {
    throw new HttpError(400, 'Current password and new password are required.');
  }

  if (newPassword.length < 6) {
    throw new HttpError(400, 'New password must be at least 6 characters.');
  }

  const account = await findUserByIdAndRole(req.user.id, req.user.role);

  if (!account) {
    throw new HttpError(404, 'Account was not found.');
  }

  const passwordMatches = await comparePassword(currentPassword, account.password_hash);

  if (!passwordMatches) {
    throw new HttpError(401, 'Current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);
  const email = account.email;

  if (req.user.role === 'driver') {
    await query('UPDATE drivers SET password_hash = ? WHERE email = ?', [passwordHash, email]);
    await query('UPDATE passengers SET password_hash = ? WHERE email = ?', [passwordHash, email]);
  } else {
    await query('UPDATE passengers SET password_hash = ? WHERE email = ?', [passwordHash, email]);
    await query('UPDATE drivers SET password_hash = ? WHERE email = ?', [passwordHash, email]);
  }

  res.json({ message: 'Password updated.' });
});

export const addDriverVehicle = asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new HttpError(403, 'Only drivers can manage vehicles.');
  }

  const licenseNumber = normalizeLicensePlate(req.body.licenseNumber);
  const vehicleInfo = String(req.body.vehicleInfo ?? '').trim();
  const availableSeats = validateSeats(req.body.availableSeats);

  validateLicensePlate(licenseNumber);

  if (!vehicleInfo) {
    throw new HttpError(400, 'Vehicle info is required.');
  }

  const existing = await query(
    `SELECT vehicle_id FROM driver_vehicles WHERE license_number = ?
     UNION
     SELECT driver_id AS vehicle_id FROM drivers WHERE license_number = ? AND driver_id <> ?
     LIMIT 1`,
    [licenseNumber, licenseNumber, req.user.id]
  );

  if (existing[0]) {
    throw new HttpError(409, 'Car license plate is already registered.');
  }

  await query(
    `INSERT INTO driver_vehicles (driver_id, license_number, vehicle_info, available_seats, is_active)
     VALUES (?, ?, ?, ?, 0)`,
    [req.user.id, licenseNumber, vehicleInfo, availableSeats]
  );

  res.status(201).json(await getAccountPayload(req.user));
});

export const selectDriverVehicle = asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new HttpError(403, 'Only drivers can manage vehicles.');
  }

  const vehicleId = Number(req.params.vehicleId);

  if (!Number.isInteger(vehicleId) || vehicleId < 1) {
    throw new HttpError(400, 'vehicleId must be valid.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [vehicleRows] = await connection.execute(
      `SELECT vehicle_id, license_number, vehicle_info, available_seats
       FROM driver_vehicles
       WHERE vehicle_id = ? AND driver_id = ?
       LIMIT 1
       FOR UPDATE`,
      [vehicleId, req.user.id]
    );
    const vehicle = vehicleRows[0];

    if (!vehicle) {
      throw new HttpError(404, 'Vehicle was not found.');
    }

    await connection.execute('UPDATE driver_vehicles SET is_active = 0 WHERE driver_id = ?', [req.user.id]);
    await connection.execute('UPDATE driver_vehicles SET is_active = 1 WHERE vehicle_id = ?', [vehicleId]);
    await connection.execute(
      `UPDATE drivers
       SET license_number = ?, vehicle_info = ?, available_seats = ?
       WHERE driver_id = ?`,
      [vehicle.license_number, vehicle.vehicle_info, vehicle.available_seats, req.user.id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json(await getAccountPayload(req.user));
});

export const deleteDriverVehicle = asyncHandler(async (req, res) => {
  if (req.user.role !== 'driver') {
    throw new HttpError(403, 'Only drivers can manage vehicles.');
  }

  const vehicleId = Number(req.params.vehicleId);

  if (!Number.isInteger(vehicleId) || vehicleId < 1) {
    throw new HttpError(400, 'vehicleId must be valid.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [vehicles] = await connection.execute(
      `SELECT vehicle_id, license_number, vehicle_info, available_seats, is_active
       FROM driver_vehicles
       WHERE driver_id = ?
       ORDER BY is_active DESC, created_at DESC
       FOR UPDATE`,
      [req.user.id]
    );

    if (vehicles.length <= 1) {
      throw new HttpError(400, 'Drivers must keep at least one car on the account.');
    }

    const vehicle = vehicles.find((row) => Number(row.vehicle_id) === vehicleId);

    if (!vehicle) {
      throw new HttpError(404, 'Vehicle was not found.');
    }

    await connection.execute('DELETE FROM driver_vehicles WHERE vehicle_id = ? AND driver_id = ?', [
      vehicleId,
      req.user.id
    ]);

    if (vehicle.is_active) {
      const nextVehicle = vehicles.find((row) => Number(row.vehicle_id) !== vehicleId);
      await connection.execute('UPDATE driver_vehicles SET is_active = 1 WHERE vehicle_id = ?', [
        nextVehicle.vehicle_id
      ]);
      await connection.execute(
        `UPDATE drivers
         SET license_number = ?, vehicle_info = ?, available_seats = ?
         WHERE driver_id = ?`,
        [nextVehicle.license_number, nextVehicle.vehicle_info, nextVehicle.available_seats, req.user.id]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json(await getAccountPayload(req.user));
});
