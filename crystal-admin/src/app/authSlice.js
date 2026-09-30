import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { auth } from '../api';
import { tokenStore, translate } from '../api/client';

/**
 * The signed-in administrator, and what they may open.
 *
 * `pages` is the list the API answered with - one row per screen this role
 * has a level above none on.  The sidebar, the router and every write button
 * read from it, so what the console offers and what the server will accept
 * cannot drift apart: they are the same list.
 */

export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const { data } = await auth.login(username, password);
      tokenStore.save(data);
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Re-reads the session on every page load.
 *
 * The token in storage may be for an account that has since been given a
 * different role, or disabled - so the console asks rather than trusting what
 * it cached, and a permission taken away this morning is gone by the next
 * refresh rather than at the next sign-in.
 */
export const loadSession = createAsyncThunk(
  'auth/loadSession',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await auth.profile();
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const initialState = {
  admin: null,
  pages: [],
  status: tokenStore.get() ? 'loading' : 'anonymous',
  error: null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedOut(state) {
      tokenStore.clear();
      state.admin = null;
      state.pages = [];
      state.status = 'anonymous';
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    const accept = (state, action) => {
      state.admin = action.payload.admin;
      state.pages = action.payload.pages || [];
      state.status = 'signedIn';
      state.error = null;
    };

    builder
      .addCase(signIn.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(signIn.fulfilled, accept)
      .addCase(signIn.rejected, (state, action) => {
        state.status = 'anonymous';
        state.error = action.payload || translate('signin.signInFailed');
      })
      .addCase(loadSession.pending, (state) => { state.status = 'loading'; })
      .addCase(loadSession.fulfilled, accept)
      .addCase(loadSession.rejected, (state) => {
        // A session that cannot be re-read is not a session. The client has
        // already cleared the tokens by this point.
        tokenStore.clear();
        state.admin = null;
        state.pages = [];
        state.status = 'anonymous';
      });
  }
});

export const { signedOut, clearError } = authSlice.actions;

/**
 * The level this administrator has on one page url.
 *
 * The longest matching prefix wins, so a grant on /admin/service covers
 * /admin/service/tickets unless that page has a row of its own - which is the
 * same rule the seed uses when it builds a role's grid, and the same one the
 * server enforces.  Keeping all three in step is why it is written down in
 * exactly these three places and nowhere else.
 */
export function permissionOf(pages, pageUrl) {
  if (!pages || !pages.length || !pageUrl) return 0;

  let best = -1;
  let level = 0;

  pages.forEach((page) => {
    const url = page.page_url;
    if (pageUrl !== url && pageUrl.indexOf(url + '/') !== 0) return;
    if (url.length > best) {
      best = url.length;
      level = page.permission;
    }
  });

  return level;
}

export const selectAdmin = (state) => state.auth.admin;
export const selectPages = (state) => state.auth.pages;
export const selectAuthStatus = (state) => state.auth.status;

export default authSlice.reducer;
