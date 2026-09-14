/*
 * Fixtures for walletScreen.test.js, in their own module.
 *
 * jest.mock is HOISTED above the imports, so the factory cannot close over a
 * const declared in the test file - it would be undefined at the moment the
 * mock is built. Requiring them from here inside the factory is the way round
 * that, and it keeps the rows readable rather than inlined into a mock.
 */
const WALLET = {
  user_id: 7,
  login: 'demo-member',
  nickname: 'Demo',
  email: 'demo@crystal.example',
  phone: null,
  status: 'ACTIVE',
  balance: '120.50',
  frozen: '0.00',
  currency: 'USD',
  point_balance: 340,
  updated_at: '2026-09-01T10:00:00.000Z'
};

const MOVEMENT = {
  id: 1,
  user_id: 7,
  type: 'CHARGE',
  amount: '100.00',
  balance_after: '120.50',
  currency: 'USD',
  reference: 'TOP-1',
  description: 'Card top-up',
  status: 'SUCCESS',
  created_at: '2026-09-01T09:00:00.000Z'
};

const POINT = {
  id: 1,
  user_id: 7,
  type: 'LOGIN',
  amount: 5,
  balance_after: 340,
  description: 'Daily sign-in reward',
  reference: null,
  created_at: '2026-09-01T09:00:00.000Z'
};

/** What the page asked the server to write, for the test to read back. */
const adjusted = [];

module.exports = {
  WALLET: WALLET,
  MOVEMENT: MOVEMENT,
  POINT: POINT,
  adjusted: adjusted
};
