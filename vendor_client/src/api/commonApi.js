import API from './axios';

export const downloadFile = async (params) => {
  try {
    const response = await API.get("/common/download_file", {
      params,
      responseType: "blob", // Important for binary data (like files)
    });
    return response;
  } catch (error) {
    return error;
  }
}
