import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { dashboard } from '../api';
import { loadSession, signedOut, signIn } from './authSlice';

/**
 * The signing certificates' expiry, held for the session.
 *
 * Two things read it: the indicator in the header, which is on every screen
 * and must not ask on every one of them, and the card on the dashboard, which
 * is where somebody goes to look properly. So it is chrome state and lives
 * here, beside the session - one request when the header first mounts, and a
 * fresh one each time the dashboard card does, which the header then shows
 * too without asking again.
 *
 * FAILURE IS AN ANSWER, NOT A RETRY LOOP. A report that cannot be had - the
 * API is down, or this role cannot read the dashboard (403) - leaves `report`
 * empty and the status 'failed', and nothing asks again until the dashboard
 * card mounts. The header draws nothing for an empty report; it does not
 * spin, and it does not say "unknown" in red on every screen of a role that
 * was simply never meant to see it.
 *
 * A NEW SESSION FORGETS THE OLD ONE'S REPORT. Signing out, a different
 * administrator signing in, or a session that could not be re-read all clear
 * it - and an answer that arrives after that, for a request the old session
 * made, is dropped by its request id rather than shown to the new one.
 */

const initialState = {
  status: 'idle',          // idle | loading | ready | failed
  report: null,            // the API's answer - see utils/certificates.js
  receivedAt: null,        // the reader's clock when it arrived, to age it by
  requestId: null
};

/**
 * `{ refresh: true }` asks again even when a report is held - the dashboard
 * card. Without it, only a session that has not asked yet asks - the header.
 * Either way a request already in flight is left to answer for both.
 */
export const loadCertificates = createAsyncThunk(
  'certificates/load',
  async () => {
    const { data } = await dashboard.certificates();
    if (!data || !Array.isArray(data.certificates)) throw new Error('not a certificate report');
    return { report: data, receivedAt: Date.now() };
  },
  {
    condition: (options, { getState }) => {
      const state = getState().certificates;
      if (!state) return false;
      if (state.status === 'loading') return false;
      return (options && options.refresh) || state.status === 'idle';
    }
  }
);

const certificatesSlice = createSlice({
  name: 'certificates',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    const forget = () => initialState;

    builder
      .addCase(loadCertificates.pending, (state, action) => {
        /* The report held so far stays on screen while a fresh one is fetched. */
        state.status = 'loading';
        state.requestId = action.meta.requestId;
      })
      .addCase(loadCertificates.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.status = 'ready';
        state.report = action.payload.report;
        state.receivedAt = action.payload.receivedAt;
        state.requestId = null;
      })
      .addCase(loadCertificates.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.status = 'failed';
        state.report = null;
        state.receivedAt = null;
        state.requestId = null;
      })
      .addCase(signedOut, forget)
      .addCase(signIn.fulfilled, forget)
      .addCase(loadSession.rejected, forget);
  }
});

export const selectCertificates = (state) => state.certificates || initialState;

export default certificatesSlice.reducer;
