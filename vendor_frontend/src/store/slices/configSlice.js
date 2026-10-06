import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  fixed: false,
  isOpenNews: false,
};

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setHeaderFixed: (state, action) => {
      state.fixed = action.payload;
    },
    setIsOpenNews: (state, action) => {
      state.isOpenNews = action.payload;
    },
  },
});

export const { setHeaderFixed, setIsOpenNews } = configSlice.actions;
export default configSlice.reducer;
