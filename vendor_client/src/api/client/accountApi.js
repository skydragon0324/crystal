import { apiRequest } from '../axios';

export const getEshopWalletBalance = async (params) => {
  return apiRequest("get", "/eshop_wallet_balance", null, params);
}

export const getEshopOrderList = async (params) => {
  return apiRequest("get", "/eshop_order_list", null, params);
}

export const getEshopOrderDetail = async (params) => {
  return apiRequest("get", "/eshop_order_detail", null, params);
}

export const getEshopWalletTransactions = async (params) => {
  return apiRequest("get", "/eshop_wallet_transactions", null, params);
}

export const getAppstorePurchaseLog = async (params) => {
  return apiRequest("get", "/appstore_purchase_log", null, params);
}

export const getAppstoreLicenseQr = async (params) => {
  return apiRequest("get", "/appstore_license_qr", null, params);
}

export const getAppstoreComments = async (params) => {
  return apiRequest("get", "/appstore_comments", null, params);
}

export const getAppstoreFavorites = async (params) => {
  return apiRequest("get", "/appstore_favorites", null, params);
}

export const getAppstoreWalletTransactions = async (params) => {
  return apiRequest("get", "/appstore_wallet_transactions", null, params);
}

export const getSoftPointLog = async (params) => {
  return apiRequest("get", "/soft_point_log", null, params);
}

export const getKaraokeOldLog = async (params) => {
  return apiRequest("get", "/karaoke_old_log", null, params);
}

export const getBMediaOldLog = async (params) => {
  return apiRequest("get", "/bmedia_old_log", null, params);
}

export const getActivityPointLog = async (params) => {
  return apiRequest("get", "/activity_point_log", null, params);
}

export const getActivityOldLog = async (params) => {
  return apiRequest("get", "/activity_old_log", null, params);
}

export const getEprodRegisterLog = async (params) => {
  return apiRequest("get", "/eprod_regist_add_log", null, params);
}

export const sendLicenseErrorReport = async (params) => {
  return apiRequest("post", "/eprod_license_error_report", params);
}

export const getKaraokeKeygenLog = async (params) => {
  return apiRequest("get", "/karaoke_keygen_log", null, params);
}

export const getManbangKeygenLog = async (params) => {
  return apiRequest("get", "/manbang_keygen_log", null, params);
}

export const getBMediaProviders = async (params) => {
  return apiRequest("get", "/bmedia_providers", null, params);
}

export const getBMediaKeygenLog = async (params) => {
  return apiRequest("get", "/bmedia_keygen_log", null, params);
}

export const getBMediaKeygenById = async (params) => {
  return apiRequest("get", "/bmedia_keygen_by_id", null, params);
}

export const getFeedbackThreads = async (params) => {
  return apiRequest("get", "/feedback_threads", null, params);
}

export const editFeedbackThread = async (params) => {
  return await apiRequest("post", "/feedback_thread_edit", params);
}

export const getFeedbackMessages = async (params) => {
  return apiRequest("get", "/feedback_messages", null, params);
}

export const addFeedbackMessage = async (params) => {
  return await apiRequest("post", "/feedback_message_add", params);
}

export const deleteFeedbackMessage = async (params) => {
  return await apiRequest('post', "/feedback_message_delete", params);
}

export const getBlogMyArticles = async (params) => {
  return apiRequest("get", "/blog_my_articles", null, params);
}

export const getBlogContent = async (params) => {
  return apiRequest("get", "/blog_article_content", null, params);
}
