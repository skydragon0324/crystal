import { createSlice } from '@reduxjs/toolkit';

/**
 * Chrome state that outlives a route change: the sidebar collapse and the
 * page title the header shows.
 *
 * The collapse preference is mirrored into localStorage because it is a
 * per-person habit, not a per-session one.
 */

const COLLAPSE_KEY = 'crystal.admin.sidebar';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch (err) {
    return false;
  }
}

const slice = createSlice({
  name: 'ui',
  initialState: {
    sidebarCollapsed: readCollapsed(),
    pageTitle: 'Dashboard',
    breadcrumb: []
  },
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, state.sidebarCollapsed ? '1' : '0');
      } catch (err) {
        /* the preference just will not persist */
      }
    },
    setPage(state, action) {
      state.pageTitle = action.payload.title;
      state.breadcrumb = action.payload.breadcrumb || [];
    }
  }
});

export const { toggleSidebar, setPage } = slice.actions;

export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed;
export const selectPageTitle = (state) => state.ui.pageTitle;
export const selectBreadcrumb = (state) => state.ui.breadcrumb;

export default slice.reducer;
