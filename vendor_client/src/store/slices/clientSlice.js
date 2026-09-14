import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isAuthenticated: false,
  user: null,
  pages: [],
  loading: false,
  error: null,
};

const clientSlice = createSlice({
  name: "client",
  initialState,
  reducers: {
    loginRequest: (state) => {
      state.loading = true;
      state.error = null;
    },
    x509Request: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.pages = action.payload.pages || [];
    },
    loginFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    logout: (state) => {
      state.loading = false;
      state.isAuthenticated = false;
      state.user = null;
      state.pages = [];
    },
    // Raised by the axios interceptor when a token refresh fails. Distinct
    // from `logout`, which the saga follows with a server call - by this
    // point the session is already gone, so there is nothing to sign out of.
    sessionExpired: (state) => {
      state.loading = false;
      state.isAuthenticated = false;
      state.user = null;
      state.pages = [];
    },
    authRequest: (state) => {
      state.loading = true;
      state.error = null;
    },
    checkAuthSuccess: (state, action) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.pages = action.payload.pages || [];
    },
    checkAuthFailure: (state, action) => {
      state.loading = false;
      state.isAuthenticated = false;
      state.user = null;
      state.pages = [];
      state.error = action.payload;
    },
  },
});

export const { loginRequest, x509Request, loginSuccess, loginFailure, logout, sessionExpired, authRequest, checkAuthSuccess, checkAuthFailure } = clientSlice.actions;
export default clientSlice.reducer;
