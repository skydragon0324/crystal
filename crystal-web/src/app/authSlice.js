import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/api';
import { clearSession, getToken, setSession, translate } from '@/api/client';
import { x509SignIn } from './x509Agent';
import * as mik from '@/app/mikAgent';

/**
 * The member session.
 *
 * `status` starts as 'restoring' so the header does not flash "Sign in" at a
 * member who is already signed in on every page load.
 *
 * The device-aware rule (spec 5) lives on the server; the client only asks
 * `/auth/methods` which form to draw. Deciding it locally from the
 * User-Agent would let the two disagree, and the server is the one that
 * matters.
 */

export const signInWithPassword = createAsyncThunk(
  'auth/password',
  async ({ user_id: userId, password, cid }, { rejectWithValue }) => {
    try {
      /*
       * THE SIM PROVES THE cid WHERE IT CAN.
       *
       * The typed cid has always been recorded and never checked - a number
       * somebody knew. In the customised mobile browser the card itself can
       * sign for it, so the same form takes the same three fields and sends
       * them the stronger way; every other browser is unchanged, because
       * mikAgent.available() is false there and this falls straight through.
       *
       * A card that is not registered yet, or that refuses, is NOT a failed
       * sign-in: it falls back to the password path, which is exactly what
       * the member would have got a moment ago.
       */
      if (cid && mik.available()) {
        try {
          const signed = await mik.mikSignIn(userId, password, cid);
          setSession(signed.token, signed.refreshToken);
          return signed;
        } catch (cardError) {
          /*
           * ANY failure of the card path falls through to the password, and
           * that is deliberate rather than lazy. An earlier version tried to
           * tell a refused CARD from a wrong PASSWORD and rethrow the second,
           * which cannot be done from here: the server answers 401 to both,
           * and the test for it proved the guard turned a working sign-in
           * into a refusal.
           *
           * Falling through costs nothing: the password endpoint refuses a
           * wrong password itself, with the message it has always used, and a
           * phone sending a typed cid is what this form did before the card
           * existed. What it does NOT do is make a password-only sign-in
           * weaker than it was.
           *
           * It does mean a broken card quietly downgrades to the password, so
           * it is logged. If a deployment ever wants the card to be required
           * rather than preferred, that belongs on the server - refusing a
           * password sign-in from a phone - not here, where anybody can edit
           * the condition out.
           */
          // eslint-disable-next-line no-console
          console.warn('[auth] the SIM could not sign this in, using the password alone: '
            + ((cardError && (cardError.code || cardError.message)) || cardError));
        }
      }

      const { data } = await api.auth.login(userId, password, cid);
      setSession(data.token, data.refreshToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * The desktop Sign in button: no fields, the member's certificate agent signs
 * the server's challenge (app/x509Agent.js). The session that comes back is the
 * same shape as any other sign-in.
 *
 * An agent failure rejects with its dictionary address (`auth.signin.*`); a
 * refusal from the API with the message the API already translated.
 */
export const signInWithCertificate = createAsyncThunk(
  'auth/certificate',
  async (_, { rejectWithValue }) => {
    try {
      const data = await x509SignIn();
      setSession(data.token, data.refreshToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.code || err.message);
    }
  }
);

export const signInWithOtp = createAsyncThunk(
  'auth/otp',
  async ({ phone, code }, { rejectWithValue }) => {
    try {
      const { data } = await api.auth.verifyOtp(phone, code);
      setSession(data.token, data.refreshToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const registerAccount = createAsyncThunk(
  'auth/register',
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.auth.register(payload);
      setSession(data.token, data.refreshToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const restoreSession = createAsyncThunk(
  'auth/restore',
  async (_, { rejectWithValue }) => {
    if (!getToken()) return rejectWithValue(null);
    try {
      const { data } = await api.auth.me();
      return data;
    } catch (err) {
      clearSession();
      return rejectWithValue(null);
    }
  }
);

/** Refetches the wallet after anything that moves money or points. */
export const refreshWallet = createAsyncThunk('auth/wallet', async () => {
  const { data } = await api.account.wallet();
  return data;
});

const slice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    wallet: null,
    status: 'restoring', // restoring | anonymous | authenticated | pending
    error: null
  },
  reducers: {
    signOut(state) {
      clearSession();
      state.user = null;
      state.wallet = null;
      state.status = 'anonymous';
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
    setUser(state, action) {
      state.user = action.payload;
    }
  },
  extraReducers: (builder) => {
    const pending = (state) => {
      state.status = 'pending';
      state.error = null;
    };
    const fulfilled = (state, action) => {
      state.user = action.payload.user;
      state.status = 'authenticated';
      state.error = null;
    };
    const rejected = (state, action) => {
      state.status = 'anonymous';
      state.error = action.payload || translate('auth.signin.couldNotSignIn');
    };

    builder
      .addCase(signInWithPassword.pending, pending)
      .addCase(signInWithPassword.fulfilled, fulfilled)
      .addCase(signInWithPassword.rejected, rejected)
      .addCase(signInWithCertificate.pending, pending)
      .addCase(signInWithCertificate.fulfilled, fulfilled)
      .addCase(signInWithCertificate.rejected, rejected)
      .addCase(signInWithOtp.pending, pending)
      .addCase(signInWithOtp.fulfilled, fulfilled)
      .addCase(signInWithOtp.rejected, rejected)
      .addCase(registerAccount.pending, pending)
      .addCase(registerAccount.fulfilled, fulfilled)
      .addCase(registerAccount.rejected, rejected)
      .addCase(restoreSession.pending, (state) => {
        state.status = 'restoring';
      })
      /*
       * `/auth/me` answers the USER, not a session envelope - there is no
       * token to reissue when one is already held, and no wallet in it.  The
       * wallet is loaded separately by the account area, which is the only
       * part of the site that shows a balance.
       */
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null;
        state.wallet = null;
        state.status = 'anonymous';
      })
      .addCase(refreshWallet.fulfilled, (state, action) => {
        state.wallet = action.payload;
      });
  }
});

export const { signOut, clearError, setUser } = slice.actions;

export const selectUser = (state) => state.auth.user;
export const selectWallet = (state) => state.auth.wallet;
export const selectAuthStatus = (state) => state.auth.status;
export const selectIsSignedIn = (state) => state.auth.status === 'authenticated';

export default slice.reducer;
