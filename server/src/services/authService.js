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

const PHONE_PATTERN = /^\d+$/;
const LICENSE_PLATE_PATTERN = /^[A-Z]\d{1,7}$/;
const DRIVER_MIN_AGE = 21;
const PROFILE_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
const MAX_PROFILE_IMAGE_LENGTH = 1_500_000;

const oppositeRoleFor = (role) => (role === 'driver' ? 'passenger' : 'driver');

const validatePhone = (phone) => {
  if (!PHONE_PATTERN.test(String(phone))) {
    throw new HttpError(400, 'Phone number must contain numbers only.', {
      code: 'INVALID_PHONE'
    });
  }
};

const normalizeLicensePlate = (licenseNumber) => String(licenseNumber).trim().toUpperCase();

const validateLicensePlate = (licenseNumber) => {
  if (!LICENSE_PLATE_PATTERN.test(licenseNumber)) {
    throw new HttpError(
      400,
      'Car license plate must be one letter followed by 1 to 7 numbers.',
      {
        code: 'INVALID_LICENSE_PLATE'
      }
    );
  }
};

const validateDriverAge = (birthDate) => {
  const date = new Date(`${birthDate}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Driver birth date must be a valid date.', {
      code: 'INVALID_DRIVER_BIRTH_DATE'
    });
  }

  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const birthdayThisYear = new Date(Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  if (today < birthdayThisYear) {
    age -= 1;
  }

  if (age < DRIVER_MIN_AGE) {
    throw new HttpError(400, 'Drivers must be at least 21 years old to register.', {
      code: 'DRIVER_UNDERAGE'
    });
  }

  return birthDate;
};

const validateProfileImage = (profileImage) => {
  if (!profileImage) {
    return null;
  }

  if (
    typeof profileImage !== 'string' ||
    profileImage.length > MAX_PROFILE_IMAGE_LENGTH ||
    !PROFILE_IMAGE_PATTERN.test(profileImage)
  ) {
    throw new HttpError(400, 'Driver profile picture must be a PNG, JPEG, or WEBP image under 1.5 MB.', {
      code: 'INVALID_PROFILE_IMAGE'
    });
  }

  return profileImage.replace(/\s/g, '');
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

const ensureAccountCanUseRole = async ({ email, requestedRole, existingPassword }) => {
  if (email === env.admin.email) {
    throw new HttpError(409, 'Email is already registered.');
  }

  const accounts = await findAccountsByEmail(email);
  const sameRoleAccount = accounts.find((account) => account.role === requestedRole);

  if (sameRoleAccount) {
    throw new HttpError(409, `Email is already registered as a ${requestedRole}.`, {
      code: 'EMAIL_REGISTERED_FOR_ROLE',
      existingRole: requestedRole,
      requestedRole
    });
  }

  const oppositeRole = oppositeRoleFor(requestedRole);
  const oppositeRoleAccount = accounts.find((account) => account.role === oppositeRole);

  if (!oppositeRoleAccount) {
    return null;
  }

  if (!existingPassword) {
    throw new HttpError(
      409,
      `This email already exists as a ${oppositeRole}. Verify the same password to create a ${requestedRole} account.`,
      {
        code: 'ACCOUNT_EXISTS_AS_OTHER_ROLE',
        existingRole: oppositeRole,
        requestedRole
      }
    );
  }

  const passwordMatches = await comparePassword(
    existingPassword,
    oppositeRoleAccount.user.password_hash
  );

  if (!passwordMatches) {
    throw new HttpError(401, 'Password verification failed for the existing account.', {
      code: 'EXISTING_ACCOUNT_PASSWORD_INVALID',
      existingRole: oppositeRole,
      requestedRole
    });
  }

  return oppositeRoleAccount;
};

const assertAccountCanSignIn = (role, user) => {
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
};

export const loginUser = async ({ email, password, role }) => {
  requireFields({ email, password }, ['email', 'password']);

  if (email === env.admin.email) {
    return loginAdmin({ email, password });
  }

  if (role && !['driver', 'passenger'].includes(role)) {
    throw new HttpError(400, 'Unsupported account type.');
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

  if (role) {
    const selectedAccount = matches.find((account) => account.role === role);

    if (!selectedAccount) {
      throw new HttpError(401, 'Invalid email or password for that account type.');
    }

    assertAccountCanSignIn(selectedAccount.role, selectedAccount.user);

    return {
      token: signToken(selectedAccount.user, selectedAccount.role),
      user: sanitizeUser(selectedAccount.user, selectedAccount.role)
    };
  }

  if (matches.length > 1) {
    return {
      requiresRoleSelection: true,
      message: 'Choose which account type to sign in as.',
      roles: matches.map((account) => account.role)
    };
  }

  const { role: matchedRole, user } = matches[0];

  assertAccountCanSignIn(matchedRole, user);

  return {
    token: signToken(user, matchedRole),
    user: sanitizeUser(user, matchedRole)
  };
};

export const registerPassenger = async (payload) => {
  requireFields(payload, ['fullName', 'email', 'phone', 'password']);
  validatePhone(payload.phone);

  const linkedAccount = await ensureAccountCanUseRole({
    email: payload.email,
    requestedRole: 'passenger',
    existingPassword: payload.existingPassword
  });

  const passwordHash = linkedAccount?.user.password_hash ?? (await hashPassword(payload.password));
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
    'birthDate',
    'password',
    'licenseNumber',
    'vehicleInfo',
    'availableSeats'
  ]);
  validatePhone(payload.phone);

  const linkedAccount = await ensureAccountCanUseRole({
    email: payload.email,
    requestedRole: 'driver',
    existingPassword: payload.existingPassword
  });

  const availableSeats = Number(payload.availableSeats);
  const licenseNumber = normalizeLicensePlate(payload.licenseNumber);
  const birthDate = validateDriverAge(payload.birthDate);
  const profileImage = validateProfileImage(payload.profileImage);

  if (!Number.isInteger(availableSeats) || availableSeats < 1 || availableSeats > 8) {
    throw new HttpError(400, 'Driver available seats must be between 1 and 8.');
  }

  validateLicensePlate(licenseNumber);

  const existingLicense = await query(
    `SELECT driver_id AS id
     FROM drivers
     WHERE license_number = ?
     UNION
     SELECT vehicle_id AS id
     FROM driver_vehicles
     WHERE license_number = ?
     LIMIT 1`,
    [licenseNumber, licenseNumber]
  );

  if (existingLicense[0]) {
    throw new HttpError(409, 'Car license plate is already registered.');
  }

  const passwordHash = linkedAccount?.user.password_hash ?? (await hashPassword(payload.password));
  const user = await createDriver({
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    birthDate,
    passwordHash,
    licenseNumber,
    vehicleInfo: payload.vehicleInfo,
    availableSeats,
    profileImage
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
