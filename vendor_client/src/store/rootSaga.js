import { all } from "redux-saga/effects";
import { watchClientSaga } from "./sagas/clientSaga";

export default function* rootSaga() {
  yield all([watchClientSaga()]);
}
