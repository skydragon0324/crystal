import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/api';
import { clearSession, getToken, setSession } from '@/api/client';

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
  async ({ user_id: userId, password }, { rejectWithValue }) => {
    try {
      const { data } = await api.auth.login(userId, password);
      setSession(data.token, data.refreshToken);
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
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
      state.error = action.payload || 'Could not sign in';
    };

    builder
      .addCase(signInWithPassword.pending, pending)
      .addCase(signInWithPassword.fulfilled, fulfilled)
      .addCase(signInWithPassword.rejected, rejected)
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
