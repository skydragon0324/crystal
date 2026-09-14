import { apiRequest } from '../axios';
import MD5 from 'crypto-js/md5';

export const clientLogin = async (params) => {
  const data = {
    user_id: params.userId,
    password: MD5(params.password).toString(),
  };
  return await apiRequest('post', "/auth/web_login", data);
}

export const clientLogout = async () => {
  return await apiRequest('get', "/auth/web_logout");
}

export const clientAuth = async () => {
  return await apiRequest('get', "/auth/web_auth");
}

export const x509PrimaryData = async (params) => {
  return await apiRequest("post", "/x509/primary_data", params);
}

export const x509LoginVerify = async (params) => {
  return await apiRequest("post", "/x509/x509_login", params);
}
