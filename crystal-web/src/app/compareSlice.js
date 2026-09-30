import { createSlice } from '@reduxjs/toolkit';

/**
 * The compare tray.
 *
 * It lives in Redux because it is filled by wandering between product pages -
 * add the C9 Pro, go back, add the C7 Plus - and page-local state would empty
 * it on every navigation.
 *
 * It is mirrored into localStorage for the same reason a shopping basket is:
 * a reload in the middle of choosing between four phones should not undo the
 * choosing. Two to four products (spec's Compare section); the cap is
 * enforced here so no caller has to.
 */

const STORAGE_KEY = 'crystal.web.compare';
export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : [];
  } catch (err) {
    return [];
  }
}

function write(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    /* the tray just will not survive a reload */
  }
}

const slice = createSlice({
  name: 'compare',
  initialState: {
    // { id, name, slug, image, imageIntegrity } - enough to draw and verify
    // the tray without refetching.
    items: read()
  },
  reducers: {
    toggle(state, action) {
      const product = action.payload;
      const existing = state.items.filter((item) => item.id === product.id);
      if (existing.length) {
        state.items = state.items.filter((item) => item.id !== product.id);
      } else {
        if (state.items.length >= MAX_COMPARE) return;
        state.items.push({
          id: product.id,
          name: product.name,
          slug: product.slug,
          image: product.main_image || null,
          imageIntegrity: product.main_image_integrity || null
        });
      }
      write(state.items);
    },
    remove(state, action) {
      state.items = state.items.filter((item) => item.id !== action.payload);
      write(state.items);
    },
    clear(state) {
      state.items = [];
      write(state.items);
    }
  }
});

export const { toggle, remove, clear } = slice.actions;

export const selectCompareItems = (state) => state.compare.items;
export const selectCompareIds = (state) => state.compare.items.map((item) => item.id);
export const selectIsComparing = (id) => (state) =>
  state.compare.items.some((item) => item.id === id);
export const selectCanCompare = (state) => state.compare.items.length >= MIN_COMPARE;

export default slice.reducer;
