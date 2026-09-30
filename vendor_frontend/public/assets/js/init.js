$('document')
  .ready(function () {
    Window.QRCode = QRCode;
    Window.$$ = $;
    var tem, M, ret, ua = navigator.userAgent;
    M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [], /trident/i.test(M[1]) && (ret = "MSIE " + ((tem = /\brv[ :] + (\d+)/g.exec(ua) || [])[1] || "")), "Chrome" == M[1] && null != (tem = ua.match(/\b(OPR|Edge)\/(\d+)/)) && (ret = tem.slice(1).join(" ").replace("OPR", "Opera")), M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, "-?"], null != (tem = ua.match(/version\/(\d+)/i)) && M.splice(1, 1, tem[1]);
    // var browserName = (ret = M.join(" ")).split(" ")[0], browserVersion = ret.split(" ")[1];
    // var supportUrl = "/main/assets/requirements/index.html";
    // Window.browserName = browserName;
    // if (+browserVersion < 48) {
    //   window.location.assign(supportUrl);
    // }
  });
