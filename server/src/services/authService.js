import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
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

  const passwordHash = await hashPassword(payload.password);
  const user = await createDriver({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    passwordHash,
    licenseNumber: payload.licenseNumber,
    vehicleInfo: payload.vehicleInfo,
    availableSeats: payload.availableSeats
  });

  return {
    token: signToken(user, 'driver'),
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

  return sanitizeUser(user, role);
};
