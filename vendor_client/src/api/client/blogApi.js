import { apiRequest } from '../axios';

export const getBlogArticles = async (params) => {
  return apiRequest("get", "/blog_articles", null, params);
}

export const getBlogReplies = async (params) => {
  return apiRequest("get", "/blog_replies", null, params);
}

export const viewBlogReply = async (params) => {
  return await apiRequest('post', "/blog_reply_view", params);
}

export const getAdminRecomBlogArticles = async () => {
  return await apiRequest('get', "/admin_recom_blogs");
}

export const getHonormans = async () => {
  return await apiRequest('get', "/honormans");
}

export const recomArticle = async (params) => {
  return await apiRequest('post', "/blog_rating_submit", params);
}

export const addArticle = async (params) => {
  return await apiRequest('post', "/blog_add", params);
}

export const updateArticle = async (params) => {
  return await apiRequest('post', "/blog_update", params);
}

export const deleteArticle = async (blog_pk) => {
  const data = { blog_pk };
  return await apiRequest('post', "/blog_delete", data);
}