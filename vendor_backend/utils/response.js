// Helper function to format the response
const createResponse = (responseCode, data = null) => {
  return {
    code: responseCode.code,
    message: responseCode.message,
    data,
  };
};

module.exports = { createResponse };
