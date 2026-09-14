import { call, put, takeLatest } from 'redux-saga/effects';
import { loginRequest, loginSuccess, loginFailure, logout, authRequest, checkAuthSuccess, checkAuthFailure } from 'store/slices/clientSlice';
import { clientLogin, clientLogout, clientAuth } from 'api/client/authApi';
import { RESP_CODES } from 'constants/responseCodes';

function* handleLogin(action) {
  try {
    const response = yield call(clientLogin, action.payload);
    if (response.code === RESP_CODES.SUCCESS.code) {
      yield put(loginSuccess({ user: response.data.user, pages: response.data.pages }));
    } else {
      yield put(loginFailure(response));
    }
  } catch (error) {
    yield put(loginFailure(error.response));
  }
}

function* handleLogout() {
  try {
    yield call(clientLogout);
  } catch (error) {
    console.error("Logout failed", error);
  }
}

function* handleCheckAuth() {
  try {
    const response = yield call(clientAuth);
    if (response.code === RESP_CODES.SUCCESS.code) {
      yield put(checkAuthSuccess({ user: response.data.user, pages: response.data.pages }));
    } else {
      yield put(checkAuthFailure());
    }
  } catch (error) {
    yield put(checkAuthFailure());
  }
}

export function* watchClientSaga() {
  yield takeLatest(loginRequest.type, handleLogin);
  yield takeLatest(logout.type, handleLogout);
  yield takeLatest(authRequest.type, handleCheckAuth);
}
