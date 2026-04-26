import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Authentication token is required.'));
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (error) {
    return next(new HttpError(401, 'Invalid or expired authentication token.'));
  }
};

export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(new HttpError(403, 'You do not have access to this resource.'));
  }

  return next();
};
