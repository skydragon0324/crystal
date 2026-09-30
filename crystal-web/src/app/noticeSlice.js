import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/api';
import { translate } from '@/api/client';

/**
 * THE NOTICES THAT ARE LIVE TODAY.
 *
 * This belongs in Redux for the same reason the category tree does: three
 * separate pieces of chrome read the same list, and each fetching its own copy
 * would be three identical requests on the first paint - the arrival dialog,
 * the bell in the header, and the notification page the bell opens.
 *
 * TWO PIECES OF PER-VISITOR STATE ride alongside it, and they are deliberately
 * different things:
 *
 *   SILENCED   "do not remind me today" - ONE choice, for the whole dialog,
 *              not one per notice. It suppresses the arrival DIALOG and
 *              nothing else: every notice is still on the notification page,
 *              because putting a greeting down is not deleting it.
 *
 *              It was a list of dismissed ids, which was more precise than
 *              anybody needed - the dialog shows all of today's notices at
 *              once, so dismissing them one at a time was a distinction the
 *              interface never offered. A single flag is what the checkbox
 *              actually means.
 *
 *   SEEN       which notices have been read on the notification page. It is
 *              what the bell counts, so the badge empties when somebody has
 *              actually looked rather than when they have closed a modal.
 *              Only a notice the page LISTED is marked seen, and the page
 *              lists only notices that verified - see useListedNotices.
 *
 * Both are keyed by DAY, which is what stops tomorrow's announcement being
 * suppressed by a click on today's. SEEN is keyed by notice id as well,
 * because the badge counts individual notices; SILENCED is not, because the
 * dialog is one thing.
 *
 * Storage failing is not an error: a browser that refuses it simply sees the
 * dialog again, which is the safe direction to fail in.
 */

const SILENCED_KEY = 'crystal.web.notices.silenced';
const SEEN_KEY = 'crystal.web.notices.seen';

/** Today, as the browser reckons it - the unit "today" is measured in. */
export function today() {
  const now = new Date();
  return now.getFullYear() + '-'
    + String(now.getMonth() + 1).padStart(2, '0') + '-'
    + String(now.getDate()).padStart(2, '0');
}

/**
 * Reads one of the two id lists, and throws away anything from another day.
 *
 * The expiry happens on READ rather than on a timer, because there is no
 * moment to run a timer at: a tab left open over midnight is the normal case,
 * not the exception.
 */
function readIds(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (!parsed || parsed.date !== today() || !Array.isArray(parsed.ids)) return [];
    return parsed.ids;
  } catch (err) {
    return [];
  }
}

function writeIds(key, ids) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ date: today(), ids: ids }));
  } catch (err) {
    /* nothing to do - the notice shows again, which is the safe failure */
  }
}

/** Was the dialog silenced today? One flag, not a list. */
function readSilenced() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SILENCED_KEY) || 'null');
    return !!parsed && parsed.date === today();
  } catch (err) {
    return false;
  }
}

function writeSilenced() {
  try {
    window.localStorage.setItem(SILENCED_KEY, JSON.stringify({ date: today() }));
  } catch (err) {
    /* the dialog shows again tomorrow either way */
  }
}

export const loadNotices = createAsyncThunk(
  'notices/load',
  async (_, { getState }) => {
    // Already loaded is already loaded: the header, the dialog and the page
    // all ask, and they mount within a frame of each other.
    const current = getState().notices;
    if (current.status === 'ready') return current.items;

    const { data } = await api.support.notices();
    return Array.isArray(data) ? data : [];
  },
  {
    condition: (_, { getState }) => getState().notices.status !== 'loading'
  }
);

const slice = createSlice({
  name: 'notices',
  initialState: {
    items: [],
    status: 'idle', // idle | loading | ready | failed
    error: null,
    silenced: readSilenced(),
    seen: readIds(SEEN_KEY)
  },
  reducers: {
/**
     * "Do not remind me today" - the whole dialog, once.
     *
     * Takes no id. The checkbox is a property of the dialog rather than of any
     * notice in it, so silencing it silences today and nothing narrower.
     */
    silence(state) {
      if (state.silenced) return;
      state.silenced = true;
      writeSilenced();
    },

    /**
     * Read on the notification page.
     *
     * Takes the ids rather than reading state.items, so opening the page with
     * an empty list - a failed request, a slow one - does not mark everything
     * as read and empty a badge nobody has looked at.
     */
    markSeen(state, action) {
      const ids = (action.payload || []).filter((id) => state.seen.indexOf(id) === -1);
      if (!ids.length) return;
      state.seen = state.seen.concat(ids);
      writeIds(SEEN_KEY, state.seen);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadNotices.pending, (state) => {
        if (state.status !== 'ready') state.status = 'loading';
      })
      .addCase(loadNotices.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'ready';
      })
      .addCase(loadNotices.rejected, (state, action) => {
        /*
         * A failure is recorded and never shown. An announcement is the least
         * important thing on the page; a visitor whose request for it failed
         * should get the site, not an error about a greeting.
         */
        state.status = 'failed';
        state.error = action.error ? action.error.message : translate('common.errors.couldNotLoadNotices');
      });
  }
});

export const { silence, markSeen } = slice.actions;

export const selectNotices = (state) => state.notices.items;
export const selectNoticeStatus = (state) => state.notices.status;

/**
 * What the arrival dialog may raise: everything live, unless today is silenced.
 *
 * All or nothing, deliberately. The dialog is one thing and the checkbox turns
 * it off; a partially-silenced dialog was a state nobody could arrive at.
 */
export const selectGreetingNotices = (state) =>
  (state.notices.silenced ? [] : state.notices.items);

/** Whether the visitor has put today's dialog down. */
export const selectNoticesSilenced = (state) => state.notices.silenced;

/** The ids read on the notification page today. */
export const selectSeenNoticeIds = (state) => state.notices.seen;

/**
 * What the bell counts: of the notices that may be LISTED - the verified ones,
 * from useListedNotices - those not yet read on the notification page.
 *
 * Not a selector over state.items, which is every live row, verified or not:
 * a count taken from that would include notices the page will never show,
 * and a badge nobody could ever empty by reading.
 */
export function countUnseen(listed, seen) {
  return listed.filter((notice) => seen.indexOf(notice.id) === -1).length;
}

export const selectIsSeen = (id) => (state) => state.notices.seen.indexOf(id) !== -1;

export default slice.reducer;
