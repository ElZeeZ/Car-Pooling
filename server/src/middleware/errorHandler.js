import { env } from '../config/env.js';

export const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode ?? 500;
  const payload = {
    message: statusCode === 500 ? 'Internal server error' : error.message
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (env.nodeEnv !== 'production' && statusCode === 500) {
    payload.stack = error.stack;
  }

  res.status(statusCode).json(payload);
};
