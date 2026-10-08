/*
 * SIGNING IN WITH THE SIM, from the page's side.
 *
 * What is held here is the behaviour that would be invisible if it broke -
 * the sign-in would still work, it would just quietly stop being a sign-in
 * the card proved:
 *
 *   AN ORDINARY BROWSER IS UNTOUCHED. No getSignedString, no challenge, no
 *   extra request: the user ID, the password and the typed cid, exactly as
 *   before. This is the one that matters most, because every member who is
 *   not holding the customised browser is in it.
 *
 *   THE CUSTOMISED BROWSER SIGNS. Challenge, signature over the text THE
 *   SERVER gave, then the login - and the password path is not used at all.
 *
 *   A CARD THAT FAILS DOES NOT COST A SIGN-IN. An unregistered card, a card
 *   that refuses, a card that never answers: all of them fall back to the
 *   password, which is what the member would have had a moment earlier.
 *
 *   A WRONG PASSWORD STILL FAILS. The fallback must not turn a refusal into
 *   a second attempt that reports something softer.
 */
import { signInWithPassword } from '@/app/authSlice';

const calls = { login: [], challenge: [], mikLogin: [], register: [] };
const answers = {
  challenge: null,
  mikLogin: null,
  login: null
};

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    auth: {
      login: (userId, password, cid) => {
        calls.login.push({ userId, password, cid });
        if (answers.login instanceof Error) return Promise.reject(answers.login);
        return Promise.resolve({ data: answers.login });
      },
      mikChallenge: (cid) => {
        calls.challenge.push(cid);
        if (answers.challenge instanceof Error) return Promise.reject(answers.challenge);
        return Promise.resolve({ data: answers.challenge });
      },
      mikLogin: (payload) => {
        calls.mikLogin.push(payload);
        if (answers.mikLogin instanceof Error) return Promise.reject(answers.mikLogin);
        return Promise.resolve({ data: answers.mikLogin });
      },
      mikRegister: (cid, mikData) => {
        calls.register.push({ cid, mikData });
        return Promise.resolve({ data: { cid, registered: true } });
      }
    }
  }
}));

jest.mock('@/api/client', () => ({
  __esModule: true,
  setSession: jest.fn(),
  default: {}
}));

const SESSION = { token: 'tok', refreshToken: 'ref', user: { id: 1 } };
const CARD_SESSION = { token: 'card-tok', refreshToken: 'card-ref', user: { id: 1 } };

/** Runs the thunk the way the store would, and hands back what it settled as. */
async function run(args) {
  const dispatched = [];
  const thunk = signInWithPassword(args);
  const result = await thunk(
    (action) => { dispatched.push(action); return action; },
    () => ({}),
    undefined
  );
  return result;
}

beforeEach(() => {
  calls.login = [];
  calls.challenge = [];
  calls.mikLogin = [];
  calls.register = [];
  answers.challenge = { challenge: 'CHAL1234', sign_data: 'CHAL1234:821012345678', expires_in: 120 };
  answers.mikLogin = CARD_SESSION;
  answers.login = SESSION;
  delete navigator.getSignedString;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
  delete navigator.getSignedString;
});

describe('a browser that cannot reach the SIM', () => {
  test('signs in exactly as it always did, and asks for no challenge', async () => {
    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });

    expect(result.payload).toEqual(SESSION);
    expect(calls.login).toEqual([{ userId: 'demo.1', password: 'secret', cid: '821012345678' }]);
    /* The card path was never entered. */
    expect(calls.challenge).toEqual([]);
    expect(calls.mikLogin).toEqual([]);
  });
});

describe('the customised browser', () => {
  test('signs the challenge the server gave, and never uses the password path', async () => {
    const signed = [];
    navigator.getSignedString = (text) => {
      signed.push(text);
      return Promise.resolve('BASE64SIGNATURE');
    };

    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });

    expect(result.payload).toEqual(CARD_SESSION);
    expect(calls.challenge).toEqual(['821012345678']);

    /*
     * THE TEXT IS THE SERVER'S, not something this page assembled. If the page
     * built it instead, both sides would hold the same format and a change to
     * one would fail with nothing to show for it.
     */
    expect(signed).toEqual(['CHAL1234:821012345678']);

    expect(calls.mikLogin[0]).toEqual({
      user_id: 'demo.1',
      password: 'secret',
      cid: '821012345678',
      challenge: 'CHAL1234',
      signature: 'BASE64SIGNATURE'
    });

    /* The plain login was not called at all. */
    expect(calls.login).toEqual([]);
  });

  test('takes a signature handed back through a callback', async () => {
    navigator.getSignedString = (text, done) => { done('CALLBACK-SIGNATURE'); };

    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });

    expect(result.payload).toEqual(CARD_SESSION);
    expect(calls.mikLogin[0].signature).toBe('CALLBACK-SIGNATURE');
  });
});

describe('when the card cannot help', () => {
  test('an unregistered card falls back to the password', async () => {
    navigator.getSignedString = () => Promise.resolve('SIGNATURE');
    answers.challenge = Object.assign(new Error('this SIM has not been registered'), { status: 404 });

    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });

    expect(result.payload).toEqual(SESSION);
    expect(calls.login).toHaveLength(1);
  });

  test('a card that refuses to sign falls back to the password', async () => {
    navigator.getSignedString = () => Promise.reject(new Error('the card said no'));

    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });

    expect(result.payload).toEqual(SESSION);
    expect(calls.login).toHaveLength(1);
  });

  test('a card whose signature the server refuses falls back to the password', async () => {
    navigator.getSignedString = () => Promise.resolve('SIGNATURE');
    answers.mikLogin = Object.assign(new Error('that SIM card was not accepted'), { status: 401 });

    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });

    /*
     * A refused CARD is not a refused member: the fallback runs and the
     * password decides, which is the behaviour the phone had before the card
     * was ever involved.
     */
    expect(result.payload).toEqual(SESSION);
    expect(calls.login).toHaveLength(1);
  });

  test('a wrong password still fails, and is not softened by the fallback', async () => {
    navigator.getSignedString = () => Promise.resolve('SIGNATURE');
    answers.mikLogin = CARD_SESSION;
    answers.login = Object.assign(new Error('those sign-in details'), { status: 401 });

    /* The card path succeeds here, so the password path is not reached... */
    const good = await run({ user_id: 'demo.1', password: 'secret', cid: '821012345678' });
    expect(good.payload).toEqual(CARD_SESSION);

    /* ...and with no card, the refusal is the refusal. */
    delete navigator.getSignedString;
    const bad = await run({ user_id: 'demo.1', password: 'wrong', cid: '821012345678' });
    expect(bad.payload).toBe('those sign-in details');
  });
});

describe('without a cid', () => {
  test('the card is not consulted at all', async () => {
    navigator.getSignedString = () => Promise.resolve('SIGNATURE');

    const result = await run({ user_id: 'demo.1', password: 'secret', cid: '' });

    expect(result.payload).toEqual(SESSION);
    expect(calls.challenge).toEqual([]);
  });
});
