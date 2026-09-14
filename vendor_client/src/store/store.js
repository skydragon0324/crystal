import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import logger from 'redux-logger';
import clientReducer, { sessionExpired } from 'store/slices/clientSlice';
import configReducer from 'store/slices/configSlice';
import rootSaga from './rootSaga';
import { setSessionExpiredHandler } from 'api/axios';

const sagaMiddleware = createSagaMiddleware();

const store = configureStore({
  reducer: {
    client: clientReducer,
    config: configReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware, logger),
});

sagaMiddleware.run(rootSaga);

// Wired here rather than imported by api/axios, which would close the
// cycle store -> rootSaga -> api -> axios -> store. When a refresh fails
// the app drops the user so the header falls back to its signed-out state
// instead of framing pages that can no longer load.
setSessionExpiredHandler(() => store.dispatch(sessionExpired()));

export default store;
