import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/api';

/**
 * The category tree, loaded once and shared.
 *
 * This one IS worth keeping in Redux: the header mega-panel, the mobile
 * sheet and the footer all build their links from it, and it changes about
 * as often as the company does. Fetching it per component would mean three
 * identical requests on every page load - and it is exactly the list that
 * must not be hardcoded (development rule 1), because a hardcoded copy is
 * how links end up pointing at a filter the catalogue no longer understands.
 */

export const loadCategories = createAsyncThunk(
  'catalog/categories',
  async (_, { getState }) => {
    // Already loaded is already loaded; a second nav open must not refetch.
    const current = getState().catalog;
    if (current.status === 'ready') return current.categories;
    const { data } = await api.catalog.categories();
    return data;
  }
);

const slice = createSlice({
  name: 'catalog',
  initialState: {
    categories: [],
    status: 'idle', // idle | loading | ready | failed
    error: null
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCategories.pending, (state) => {
        if (state.status !== 'ready') state.status = 'loading';
      })
      .addCase(loadCategories.fulfilled, (state, action) => {
        state.categories = action.payload;
        state.status = 'ready';
      })
      .addCase(loadCategories.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error ? action.error.message : 'Could not load the catalogue';
      });
  }
});

export const selectCategories = (state) => state.catalog.categories;
export const selectCatalogStatus = (state) => state.catalog.status;

/** The Smartphone section is addressed by type, not by a hardcoded slug. */
export const selectSmartphoneCategory = (state) =>
  state.catalog.categories.filter((category) => category.type === 'SMARTPHONE')[0] || null;

/** Everything that is not a smartphone is an Eproduct (spec 1.1). */
export const selectEproductCategories = (state) =>
  state.catalog.categories.filter((category) => category.type !== 'SMARTPHONE');

export default slice.reducer;
