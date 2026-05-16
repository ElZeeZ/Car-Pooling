import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

const ownerFromUser = (user) => {
  if (!['driver', 'passenger'].includes(user.role)) {
    throw new HttpError(403, 'Wallets are available for drivers and passengers.');
  }

  return {
    ownerType: user.role,
    ownerId: user.id
  };
};

const detectCardBrand = () => 'Card';

const CARD_NUMBER_PATTERN = /^\d{13,19}$/;
const CARDHOLDER_NAME_PATTERN = /^[\p{L}](?:[\p{L}\s'.-]{0,118}[\p{L}])?$/u;

const normalizeCardholderName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizeCardNumber = (value) => String(value ?? '').replace(/\s+/g, '');

const hashCardNumber = (value) =>
  crypto
    .createHash('sha256')
    .update(`${value}:${env.jwtSecret}`)
    .digest('hex');

const getOrCreateWallet = async ({ ownerType, ownerId }) => {
  const existingWallet = await query(
    `SELECT wallet_id, owner_type, owner_id, balance
     FROM wallet_accounts
     WHERE owner_type = ? AND owner_id = ?
     LIMIT 1`,
    [ownerType, ownerId]
  );

  if (existingWallet[0]) {
    return existingWallet[0];
  }

  const result = await query(
    `INSERT INTO wallet_accounts (owner_type, owner_id, balance)
     VALUES (?, ?, 0.00)`,
    [ownerType, ownerId]
  );

  return {
    wallet_id: result.insertId,
    owner_type: ownerType,
    owner_id: ownerId,
    balance: 0
  };
};

export const getWallet = asyncHandler(async (req, res) => {
  const owner = ownerFromUser(req.user);
  const wallet = await getOrCreateWallet(owner);
  const cards = await query(
    `SELECT card_id, cardholder_name, card_brand, last_four, expiry_month, expiry_year, card_status, created_at
     FROM payment_cards
     WHERE owner_type = ? AND owner_id = ?
     ORDER BY created_at DESC`,
    [owner.ownerType, owner.ownerId]
  );
  const transactions = await query(
    `SELECT transaction_id, booking_id, transaction_type, amount, description, created_at
     FROM wallet_transactions
     WHERE wallet_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [wallet.wallet_id]
  );

  res.json({ wallet, cards, transactions });
});

export const addPaymentCard = asyncHandler(async (req, res) => {
  const owner = ownerFromUser(req.user);
  const { cardholderName, cardNumber, expiryMonth, expiryYear } = req.body;
  const normalizedCardholderName = normalizeCardholderName(cardholderName);
  const normalizedCard = normalizeCardNumber(cardNumber);

  if (!normalizedCardholderName || !normalizedCard || !expiryMonth || !expiryYear) {
    throw new HttpError(400, 'Cardholder name, demo card number, expiry month, and expiry year are required.');
  }

  if (!CARDHOLDER_NAME_PATTERN.test(normalizedCardholderName)) {
    throw new HttpError(400, 'Cardholder name must contain letters, spaces, apostrophes, periods, or hyphens only.');
  }

  if (!CARD_NUMBER_PATTERN.test(normalizedCard)) {
    throw new HttpError(400, 'Card number must contain 13 to 19 digits only.');
  }

  const expiryMonthNumber = Number(expiryMonth);
  const expiryYearNumber = Number(expiryYear);
  const expiryMonthIsDigits = /^\d{1,2}$/.test(String(expiryMonth));
  const expiryYearIsDigits = /^\d{4}$/.test(String(expiryYear));

  if (
    !expiryMonthIsDigits ||
    !Number.isInteger(expiryMonthNumber) ||
    expiryMonthNumber < 1 ||
    expiryMonthNumber > 12 ||
    !expiryYearIsDigits ||
    !Number.isInteger(expiryYearNumber) ||
    expiryYearNumber < new Date().getFullYear()
  ) {
    throw new HttpError(400, 'Card expiry date is invalid.');
  }

  await getOrCreateWallet(owner);

  const result = await query(
    `INSERT INTO payment_cards
      (owner_type, owner_id, cardholder_name, card_brand, last_four, card_token_hash, expiry_month, expiry_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      owner.ownerType,
      owner.ownerId,
      normalizedCardholderName,
      detectCardBrand(normalizedCard),
      normalizedCard.slice(-4),
      hashCardNumber(normalizedCard),
      expiryMonthNumber,
      expiryYearNumber
    ]
  );

  res.status(201).json({
    message: 'Payment card token saved.',
    cardId: result.insertId
  });
});

export const deletePaymentCard = asyncHandler(async (req, res) => {
  const owner = ownerFromUser(req.user);
  const cardId = Number(req.params.cardId);

  if (!Number.isInteger(cardId) || cardId < 1) {
    throw new HttpError(400, 'cardId must be a valid card reference.');
  }

  const result = await query(
    `DELETE FROM payment_cards
     WHERE card_id = ? AND owner_type = ? AND owner_id = ?`,
    [cardId, owner.ownerType, owner.ownerId]
  );

  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Payment card not found for this wallet.');
  }

  res.json({ message: 'Payment card deleted.' });
});


export const topUpWallet = asyncHandler(async (req, res) => {
  const owner = ownerFromUser(req.user);
  const wallet = await getOrCreateWallet(owner);
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Top-up amount must be greater than zero.');
  }

  if (owner.ownerType !== 'passenger') {
    throw new HttpError(403, 'Top-ups are available for passenger wallets.');
  }

  await query('UPDATE wallet_accounts SET balance = balance + ? WHERE wallet_id = ?', [
    amount,
    wallet.wallet_id
  ]);

  await query(
    `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, description)
     VALUES (?, 'top_up', ?, ?)`,
    [wallet.wallet_id, amount, 'Demo wallet top-up']
  );

  res.status(201).json({ message: 'Wallet topped up.' });
});

export const withdrawWallet = asyncHandler(async (req, res) => {
  const owner = ownerFromUser(req.user);
  const wallet = await getOrCreateWallet(owner);
  const amount = Number(req.body.amount);
  const cardId = req.body.cardId ? Number(req.body.cardId) : null;

  if (owner.ownerType !== 'driver') {
    throw new HttpError(403, 'Withdrawals are available for driver wallets.');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Withdrawal amount must be greater than zero.');
  }

  if (amount > Number(wallet.balance)) {
    throw new HttpError(400, 'Withdrawal amount exceeds wallet balance.');
  }

  if (cardId) {
    const cards = await query(
      `SELECT card_id
       FROM payment_cards
       WHERE card_id = ? AND owner_type = 'driver' AND owner_id = ?
       LIMIT 1`,
      [cardId, owner.ownerId]
    );

    if (!cards[0]) {
      throw new HttpError(404, 'Selected card was not found for this driver.');
    }
  }

  await query('UPDATE wallet_accounts SET balance = balance - ? WHERE wallet_id = ?', [
    amount,
    wallet.wallet_id
  ]);

  await query(
    `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, description)
     VALUES (?, 'withdrawal', ?, ?)`,
    [wallet.wallet_id, amount, cardId ? `Withdrawal to card #${cardId}` : 'Demo wallet withdrawal']
  );

  res.status(201).json({ message: 'Wallet withdrawal recorded.' });
});
