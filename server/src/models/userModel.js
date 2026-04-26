import { query } from '../config/db.js';

const ROLE_CONFIG = {
  driver: {
    table: 'drivers',
    idColumn: 'driver_id',
    fields:
      'driver_id AS id, full_name, email, phone, password_hash, license_number, verification_status, vehicle_info, available_seats, account_status'
  },
  passenger: {
    table: 'passengers',
    idColumn: 'passenger_id',
    fields: 'passenger_id AS id, full_name, email, phone, password_hash, account_status'
  }
};

const getRoleConfig = (role) => {
  const config = ROLE_CONFIG[role];

  if (!config) {
    throw new Error(`Unsupported role: ${role}`);
  }

  return config;
};

export const findUserByEmailAndRole = async (email, role) => {
  const config = getRoleConfig(role);
  const rows = await query(
    `SELECT ${config.fields} FROM ${config.table} WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
};

export const findAccountsByEmail = async (email) => {
  const roles = Object.keys(ROLE_CONFIG);
  const accounts = await Promise.all(
    roles.map(async (role) => ({
      role,
      user: await findUserByEmailAndRole(email, role)
    }))
  );

  return accounts.filter((account) => account.user);
};

export const findUserByIdAndRole = async (id, role) => {
  const config = getRoleConfig(role);
  const rows = await query(
    `SELECT ${config.fields} FROM ${config.table} WHERE ${config.idColumn} = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
};

export const createPassenger = async ({ fullName, email, phone, passwordHash }) => {
  const result = await query(
    'INSERT INTO passengers (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
    [fullName, email, phone, passwordHash]
  );

  return findUserByIdAndRole(result.insertId, 'passenger');
};

export const createDriver = async ({
  fullName,
  email,
  phone,
  passwordHash,
  licenseNumber,
  vehicleInfo,
  availableSeats
}) => {
  const result = await query(
    `INSERT INTO drivers
      (full_name, email, phone, password_hash, license_number, vehicle_info, available_seats)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fullName, email, phone, passwordHash, licenseNumber, vehicleInfo, availableSeats]
  );

  return findUserByIdAndRole(result.insertId, 'driver');
};

export const sanitizeUser = (user, role) => {
  if (!user) {
    return null;
  }

  const { password_hash: passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    role
  };
};
