const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const os = require('os');
const path = require('path');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const { validationResult } = require('express-validator');
const { setWebToken } = require('../authController');
const { createResponse } = require('../../utils/response');
const { unlink } = require('../../middleware/upload');
const { extractValidParams, shellExec } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_ACTIVE, USER_TYPE } = require('../../constants/constants');

const SERVER_KEY_PATH = "certs/prhn1020_noenc.key";
const CAECC_CHAIN = "certs/GovCAecc-chain.pem";
const CARSA_CHAIN = "certs/GovCArsa-chain.pem";
const SIGN_TYPE_384 = "RSA-SHA384"; // ECC
const SIGN_TYPE_256 = "RSA-SHA256";
const POLICY_ID_LIST = [
  "1.2.408.20020827.8.3.3",
  "1.2.408.20020827.8.3.2.1",
  "1.2.408.20020827.8.3.2.2",
  "1.2.408.20020827.8.3.2.3",
];

const getFilePath = (org_path) => {
  if (os.platform().substr(0, 3) === "win") {
    return path.join(__dirname, `../../${org_path}`);
  }
  return org_path;
}

const getCertTempPath = (certData) => {
  let tempPath = "/tmp";
  if (os.platform().substr(0, 3) === "win") {
    let temp_path = path.normalize(__dirname + '/../../temp');
    if (!fs.existsSync(temp_path)) {
      fs.mkdirSync(temp_path);
    }
    tempPath = temp_path;
  }
  const randName = new Date().getTime();
  const certPath = `${tempPath}/${randName}.pem`;
  fs.writeFileSync(certPath, certData);
  return certPath;
}

const getCertField = (certStr, field) => {
  if (field === "Policy") {
    const start = certStr.indexOf("Policy: ");
    if (start < 0) {
      return { result: false, message: getLangText("X509_ERR_POLICY_ID") };
    }
    const policy_id = certStr.substr(start + 8, 24).trim();
    if (!policy_id) {
      return { result: false, message: getLangText("X509_ERR_POLICY_ID") };
    }
    if (!POLICY_ID_LIST.includes(policy_id)) {
      return { result: false, message: getLangText("X509_ERR_PERSONAL_CERT") };
    }
    return { result: true, policy_id };
  } else if (field === "CN") {
    let cn_start = certStr.indexOf("Subject: CN = ");
    let cn_end = -1;
    if (cn_start >= 0) {
      const cn_end = certStr.indexOf(", CN = ");
      return certStr.substr(cn_start + 14, cn_end - cn_start - 14).trim();
    }
    cn_start = certStr.indexOf("Subject: CN=");
    cn_end = certStr.indexOf(", CN=");
    if (cn_start < 0) {
      return "";
    }
    return certStr.substr(cn_start + 12, cn_end - cn_start - 12);
  }
}

const checkCert = (certData, certType = "RSA") => {
  // NOTE: certType: "RSA", "ECDSA"
  const certPath = getCertTempPath(certData);
  const caPath = getFilePath(certType === "RSA" ? CARSA_CHAIN : CAECC_CHAIN);

  // Verify x509 CA
  let cmd = `openssl verify -CAfile ${caPath} ${certPath}`;
  let output = shellExec(cmd);
  if (!output.includes(": OK")) {
    unlink(certPath);
    return { result: false, message: getLangText("X509_ERR_VERIFY_CA") };
  }

  // Check Policy ID
  cmd = `openssl x509 -in ${certPath} -noout -text`;
  const certStr = shellExec(cmd);
  const policyResp = getCertField(certStr, "Policy");
  if (!policyResp.result) {
    unlink(certPath);
    return policyResp;
  }

  const user_id = getCertField(certStr, "CN");
  if (!user_id) {
    unlink(certPath);
    return { result: false, message: getLangText("X509_ERR_GET_CN") };
  }

  unlink(certPath);
  return { result: true, message: "", user_id };
}

const getSignData = (plainData, privateData, encode = "base64") => {
  let privateKey = privateData;
  if (typeof (privateData) === "string") {
    privateKey = Buffer.from(privateData);
  }
  const sign = crypto.createSign(SIGN_TYPE_384).update(plainData);
  return sign.sign(privateKey, encode);
}

const verifySign = (plainData, signData, certData, certType, encode = "base64") => {
  if (!plainData || !signData || !certData) {
    return false;
  }
  let cert_data = certData;
  if (typeof (certData) === "string") {
    cert_data = Buffer.from(certData);
  }

  const verify = crypto.createVerify(certType === "RSA" ? SIGN_TYPE_256 : SIGN_TYPE_384).update(plainData);
  return verify.verify(cert_data, signData, encode);
}

const primaryData = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["client_rand", "version", "userid"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (params.version < 1214) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(createResponse(RESP_CODES.INTERNAL_SERVER_ERROR, { version: "fail" }));
    }
    const server_rand = parseInt(Math.random() * new Date().getTime()) % 1000;
    const plainData = `${params.client_rand}${server_rand}${params.userid}`;
    const privateKey = fs.readFileSync(getFilePath(SERVER_KEY_PATH));
    const server_sign = getSignData(plainData, privateKey);

    const data = {
      url: "http://20.60.0.218/certs/prhn1020.crt",
      server_rand,
      server_sign,
    };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

const x509Login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["plainData", "signData", "certData", "certType"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const cert_data = forge.util.decode64(params.certData);
    const cert_resp = checkCert(cert_data, params.certType);
    if (!cert_resp.result) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: cert_resp.message });
    }

    const verify_resp = verifySign(params.plainData, params.signData, cert_data, params.certType);
    if (!verify_resp) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("X509_ERR_VERIFY_SIGN") });
    }

    const user_id = cert_resp.user_id;
    let user = await UserModel.findUserAllInfoById(user_id);
    if (user) {
      if (user.status !== FLAG_ACTIVE) {
        return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("AUTH_ERR_BLOCKED_USER") });
      }
      user = { ...user, user_type: USER_TYPE.PID };
    } else {
      user = await CustomerModel.findCustomerInfoById(user_id);
      if (user) {
        user = { ...user, user_type: USER_TYPE.FIXED };
      }
    }
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    setWebToken(user, res);

    const data = {
      user: { ...user, password: "" }, // prevent sending hashed password to client
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  primaryData,
  x509Login,
};
