import {
  getCurrentUser,
  loginUser,
  registerDriver,
  registerPassenger
} from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  res.json(result);
});

export const registerPassengerAccount = asyncHandler(async (req, res) => {
  const result = await registerPassenger(req.body);
  res.status(201).json(result);
});

export const registerDriverAccount = asyncHandler(async (req, res) => {
  const result = await registerDriver(req.body);
  res.status(201).json(result);
});

export const me = asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user);
  res.json({ user });
});
