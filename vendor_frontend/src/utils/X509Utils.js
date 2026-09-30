import forge from 'node-forge';
import { x509PrimaryData, x509LoginVerify } from 'api/client/authApi';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

var $ = require('jquery');

const CLIENT_ADDRESS = "http://127.0.0.1:20206";

export const x509Login = async (resolve, reject) => {
  try {
    const primaryResult = await primaryRequestToClient(reject);
    const serverResult = await sendPrimaryDataToServer(primaryResult, reject);
    const secondResult = await secondaryRequestToClient(serverResult);
    const serverIp = serverResult.url.split("//").pop().split("/")[0];
    const plainData = `${primaryResult.clientRand}${serverResult.server_rand}${serverIp}`;
    const data = {
      certData: secondResult.certData,
      certType: secondResult.certType,
      signData: secondResult.signData,
      plainData: forge.util.encode64(plainData),
    }
    const loginResult = await sendSecondaryDataToServer(data, reject);
    resolve(loginResult);
  } catch (e) {
    reject(e);
  }
}

export const primaryRequestToClient = async () => {
  return new Promise((resolve, reject) => {
    $.ajax({
      type: "post",
      dataType: "json",
      url: CLIENT_ADDRESS,
      timeout: 10000,
      data: {
        request: 'primaryData',
      },
      success: async function (data, status, xhr) {
        if (data.err_message === "Cert Not Loaded") {
          reject(getLangText("X509_CERT_NOT_LOADED"));
        } else if (data.err_message === "Repeat Login") {
          reject(getLangText("X509_ERR_REPEAT_LOGIN"));
        } else {
          let client_version = data.version;
          client_version = client_version.replace('.', '').replace('.', '').replace('.', '');
          resolve({
            clientVersion: parseInt(client_version),
            clientRand: data.rand,
            clientId: data.userid,
          });
        }
      },
      error: function (data, status, err) {
        reject(getLangText("X509_ERR_COMMUNICATION"));
      },
    });
  });
}

export const sendPrimaryDataToServer = async (params, reject) => {
  const data = {
    client_rand: params.clientRand,
    userid: params.clientId,
    version: params.clientVersion,
  }
  const resp = await x509PrimaryData(data);
  if (resp.code !== RESP_CODES.SUCCESS.code) {
    if (resp.data.version === "fail") {
      reject(getLangText("X509_ERR_VERSION"));
    } else {
      reject(getLangText("TEXT_API_ERROR"));
    }
  }
  return resp.data;
}

export const secondaryRequestToClient = async (params) => {
  const { url, server_rand, server_sign } = params;
  return new Promise((resolve, reject) => {
    $.ajax({
      type: "post",
      dataType: "json",
      url: CLIENT_ADDRESS,
      timeout: 10000,
      data: {
        request: 'secondaryData',
        url,
        server_rand,
        server_sign,
      },      
      success: function (data, status, xhr) {
        if (data.err_message === 'Auth Fail') {
          reject(getLangText("X509_ERR_AUTH_FAIL"));
        } else {
          resolve(data);
        }
      },
      error: function (data, status, err) {
        reject(getLangText("X509_ERR_COMMUNICATION"));
      }
    });
  });
}

export const sendSecondaryDataToServer = async (params, reject) => {
  const resp = await x509LoginVerify(params);
  if (resp.code === RESP_CODES.SUCCESS.code) {
    return resp.data;
  } else {
    reject(resp.message);
  }
}
