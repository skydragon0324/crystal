import { configureStore } from '@reduxjs/toolkit';
import auth from './authSlice';
import catalog from './catalogSlice';
import compare from './compareSlice';
import notices from './noticeSlice';

/**
 * Four things are global: the session, the category tree the whole navigation
 * is built from, the compare tray - which has to survive moving between
 * product pages, since that is how anyone fills it - and the day's notices,
 * which three separate pieces of chrome read at once.
 *
 * Page data is not here. A product page refetched on navigation gains
 * nothing from a global cache and loses the ability to show a stale product
 * while the next one loads.
 */
const store = configureStore({
  reducer: { auth, catalog, compare, notices },
  devTools: process.env.NODE_ENV !== 'production'
});

export default store;
