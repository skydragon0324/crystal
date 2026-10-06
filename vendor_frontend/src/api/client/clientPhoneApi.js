import { apiRequest } from '../axios';

export const getProducts = async () => {
  return apiRequest("get", "/phone_products");
}

export const getProductSpec = async (product_pk) => {
  const data = {product_pk};
  return apiRequest("get", "/phone_specs", null, data);
}

export const getPhoneImages = async (product_pk) => {
  const data = {product_pk};
  return apiRequest("get", "/phone_images", null, data);
}

export const getServiceCosts = async (product_pk) => {
  const data = {product_pk};
  return apiRequest("get", "/phone_accessories", null, data);
}

export const getOsHistory = async (product_pk) => {
  const data = {product_pk};
  return apiRequest("get", "/phone_changelog", null, data);
}

export const getServiceAgency = async (params) => {
  return apiRequest("get", "/phone_agencies", null, params);
}

export const getProvinces = async () => {
  return apiRequest("get", "/provinces");
}

export const getPhoneFaqs = async (params) => {
  return apiRequest("get", "/phone_faqs", null, params);
}