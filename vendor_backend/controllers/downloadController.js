const path = require('path');
const fs = require('fs');
const { extractValidParams } = require('../utils/utils');
const RESP_CODES = require('../constants/responseCodes');
const { DOWNLOAD_PATH } = require('../constants/constants');

async function downloadFile(req, res) {
  const { url } = req.query;

  const filePath = path.join(DOWNLOAD_PATH, url);
  const fileName = url.split("/").pop(); // Optionally set the file name (use last part of the URL)

  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error("Error downloading the file: ", err);
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
  });
}

async function uploadFile(req, res) {
  const validKeys = ["org_image_url", "new_image_url", "org_content_url", "new_content_url"];
  let params = extractValidParams(req.body, validKeys);
  try {
    // remove orignal file
    if (params.org_image_url
      && params.org_image_url !== params.new_image_url
      && fs.existsSync(params.org_image_url)) {
      fs.unlinkSync(params.org_image_url);
    }
    if (params.org_content_url
      && params.org_content_url !== params.new_content_url
      && fs.existsSync(params.org_content_url)) {
      fs.unlinkSync(params.org_content_url);
    }

    // upload file
    if (req.files) {
      if (req.files.image_file) {
        params.image_url = req.files.image_file[0].path;
      }
      if (req.files.content_file) {
        params.content_url = req.files.content_file[0].path;
      }
    }

    // move file to new url
    if (params.image_url && params.new_image_url) {
      if (fs.existsSync(params.new_image_url)) {
        fs.unlinkSync(params.new_image_url);
      }
      fs.renameSync(params.image_url, params.new_image_url);
    }
    if (params.content_url && params.new_content_url) {
      if (fs.existsSync(params.new_content_url)) {
        fs.unlinkSync(params.new_content_url);
      }
      fs.renameSync(params.content_url, params.new_content_url);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  downloadFile,
  uploadFile,
};
