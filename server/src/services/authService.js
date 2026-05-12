import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import {
  createDriver,
  createPassenger,
  findAccountsByEmail,
  findUserByIdAndRole,
  sanitizeUser
} from '../models/userModel.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { HttpError } from '../utils/httpError.js';

const requireFields = (payload, fields) => {
  const missing = fields.filter((field) => !payload[field]);

  if (missing.length > 0) {
    throw new HttpError(400, 'Missing required fields.', { missing });
  }
};

const signToken = (user, role) =>
  jwt.sign(
    {
      id: user.id,
      role,
      email: user.email
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

const loginAdmin = ({ email, password }) => {
  if (email !== env.admin.email || password !== env.admin.password) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  const admin = {
    id: env.admin.id,
    full_name: env.admin.fullName,
    email: env.admin.email
  };

  return {
    token: signToken(admin, 'admin'),
    user: sanitizeUser(admin, 'admin')
  };
};

const ensureEmailIsAvailable = async (email) => {
  if (email === env.admin.email) {
    throw new HttpError(409, 'Email is already registered.');
  }

  const accounts = await findAccountsByEmail(email);

  if (accounts.length > 0) {
    throw new HttpError(409, 'Email is already registered.');
  }
};

export const loginUser = async ({ email, password }) => {
  requireFields({ email, password }, ['email', 'password']);

  if (email === env.admin.email) {
    return loginAdmin({ email, password });
  }

  const accounts = await findAccountsByEmail(email);
  const matches = [];

  for (const account of accounts) {
    const passwordMatches = await comparePassword(password, account.user.password_hash);

    if (passwordMatches) {
      matches.push(account);
    }
  }

  if (matches.length === 0) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  if (matches.length > 1) {
    throw new HttpError(409, 'This email belongs to more than one account type.');
  }

  const { role, user } = matches[0];

  if (user.account_status === 'suspended') {
    throw new HttpError(403, 'This account has been suspended by the administrator.');
  }

  if (role === 'driver') {
    if (user.account_status === 'pending' || user.verification_status === 'pending') {
      throw new HttpError(403, 'Account not verified yet.');
    }

    if (user.verification_status === 'rejected') {
      throw new HttpError(403, 'Driver account verification was rejected.');
    }
  }

  return {
    token: signToken(user, role),
    user: sanitizeUser(user, role)
  };
};

export const registerPassenger = async (payload) => {
  requireFields(payload, ['fullName', 'email', 'phone', 'password']);
  await ensureEmailIsAvailable(payload.email);

  const passwordHash = await hashPassword(payload.password);
  const user = await createPassenger({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    passwordHash
  });

  return {
    token: signToken(user, 'passenger'),
    user: sanitizeUser(user, 'passenger')
  };
};

export const registerDriver = async (payload) => {
  requireFields(payload, [
    'fullName',
    'email',
    'phone',
    'password',
    'licenseNumber',
    'vehicleInfo',
    'availableSeats'
  ]);
  await ensureEmailIsAvailable(payload.email);
  const availableSeats = Number(payload.availableSeats);

  if (!Number.isInteger(availableSeats) || availableSeats < 1 || availableSeats > 8) {
    throw new HttpError(400, 'Driver available seats must be between 1 and 8.');
  }

  const existingLicense = await query(
    `SELECT driver_id
     FROM drivers
     WHERE license_number = ?
     LIMIT 1`,
    [payload.licenseNumber]
  );

  if (existingLicense[0]) {
    throw new HttpError(409, 'License number is already registered.');
  }

  const passwordHash = await hashPassword(payload.password);
  const user = await createDriver({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    passwordHash,
    licenseNumber: payload.licenseNumber,
    vehicleInfo: payload.vehicleInfo,
    availableSeats
  });

  const wallet = await query(
    `INSERT INTO wallet_accounts (owner_type, owner_id, balance)
     VALUES ('driver', ?, 5.00)
     ON DUPLICATE KEY UPDATE balance = balance`,
    [user.id]
  );

  const walletId =
    wallet.insertId ||
    (
      await query(
        `SELECT wallet_id
         FROM wallet_accounts
         WHERE owner_type = 'driver' AND owner_id = ?
         LIMIT 1`,
        [user.id]
      )
    )[0]?.wallet_id;

  if (walletId) {
    await query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, description)
       VALUES (?, 'top_up', 5.00, 'Demo driver starting balance')`,
      [walletId]
    );
  }

  return {
    message: 'Driver registration submitted for administrator verification.',
    pendingVerification: true,
    user: sanitizeUser(user, 'driver')
  };
};

export const getCurrentUser = async ({ id, role }) => {
  if (role === 'admin') {
    return {
      id: env.admin.id,
      full_name: env.admin.fullName,
      email: env.admin.email,
      role: 'admin'
    };
  }

  const user = await findUserByIdAndRole(id, role);

  if (!user) {
    throw new HttpError(404, 'Authenticated user was not found.');
  }

  if (user.account_status === 'suspended') {
    throw new HttpError(403, 'This account has been suspended by the administrator.');
  }

  if (role === 'driver') {
    if (user.account_status === 'pending' || user.verification_status === 'pending') {
      throw new HttpError(403, 'Account not verified yet.');
    }

    if (user.verification_status === 'rejected') {
      throw new HttpError(403, 'Driver account verification was rejected.');
    }
  }

  return sanitizeUser(user, role);
};
