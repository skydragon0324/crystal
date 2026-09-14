import { configureStore } from '@reduxjs/toolkit';
import auth from './authSlice';
import ui from './uiSlice';

/**
 * Only session and chrome live in Redux. Table data does not: a list that is
 * refetched on every filter change gains nothing from a global cache and
 * loses the ability to show a stale row while the next page loads. Views use
 * the `useResource` hook for that instead.
 */
const store = configureStore({
  reducer: { auth, ui },
  devTools: process.env.NODE_ENV !== 'production'
});

export default store;
