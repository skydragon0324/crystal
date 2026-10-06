import moment from 'moment';
import sanitizeHtml from 'sanitize-html';
import { MANAGER_ROLES, DATE_FORMAT, TIME_FORMAT, HHMM_FORMAT, PRICE_FORMAT } from "constants/constants";
import { downloadFile } from 'api/commonApi';
import { getLangText } from 'lang/lang';

export const firstDateOfMonth = (date) => {
  const firstDate = moment(date);
  firstDate.date(1);
  firstDate.hour(0);
  firstDate.minute(0);
  firstDate.second(0);
  return firstDate;
}

export const calcTableSkeletonRows = (total, page, pageSize) => {
  const pageCnt = Math.ceil(total / pageSize);
  if (page + 1 === pageCnt) {
    return total % pageSize;
  }
  return pageSize;
}

export const getPagePermission = (pages, pathname) => {
  if (!pathname || typeof (pathname) !== "string") {
    return MANAGER_ROLES.NONE;
  }

  const page = pages.find(p => pathname.startsWith(p.page_url));
  if (!page) {
    return MANAGER_ROLES.NONE;
  }
  return page.permission;
}

export const downloadOperation = (fileUrl) => {
  // Create a temporary anchor (a) element
  const link = document.createElement("a");
  link.href = fileUrl;  // Set the URL for the file
  link.download = fileUrl.split('/').pop();  // Optionally set the file name (use last part of the URL)

  // Append the link to the body
  document.body.appendChild(link);

  // Programmatically trigger a click on the link to start the download
  link.click();

  // Remove the link from the DOM after triggering the download
  document.body.removeChild(link);
}

export const downloadBlob = (data, filename, filetype) => {
  // Create a download link
  const link = document.createElement("a");
  let blob;
  if (filetype === "xlsx") {
    blob = new Blob([data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } else {
    blob = new Blob([data]);
  }
  const url = window.URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute("download", filename); // Optional: filename to save as

  // Programmatically click the link to trigger the download
  document.body.appendChild(link);
  link.click();

  // Clean up by removing the link
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url); // Revoke the object URL
}

/**
 * Absolute URL for a stored upload.
 *
 * REACT_APP_UPLOAD_PATH is not set in .env, so this used to interpolate
 * the string "undefined" and hand back "undefined/uploads/intro/x.png".
 * Every such <img> failed, which is why the intro page, the product grid
 * and the phone galleries were full of broken-image boxes.
 *
 * An empty string is returned instead when there is nothing to build a
 * URL from. Callers pass that to AppImage, which reads it as "no upload
 * here" and shows the mock rather than requesting a URL that cannot
 * resolve.
 */
export const getFileUrl = (path) => {
  if (!path) return "";

  const baseUrl = process.env.REACT_APP_UPLOAD_PATH;
  if (!baseUrl) return "";

  // Tolerate a trailing slash on the base and a leading one on the path,
  // which is otherwise a double slash the upload host may not resolve.
  return `${String(baseUrl).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

export const getServerUrl = (path) => {
  const baseUrl = process.env.REACT_APP_SERVER_URL;
  return `${baseUrl}/${path}`;
}

export const getEshopGoodDetailUrl = (goods_id) => {
  if (!goods_id) {
    return "";
  }
  const baseUrl = process.env.REACT_APP_ESHOP_URL;
  return `${baseUrl}/www/index.php/goods/detail/${goods_id}`;
}

export const getEshopGoodImageUrl = (path) => {
  if (!path || path.length <= 2) {
    return "";
  }
  const baseUrl = process.env.REACT_APP_ESHOP_URL;
  return `${baseUrl}/www/contents/goods/thumb/${path.slice(path.length - 2)}/${path}`;
}

export const getAppstoreUrl = (path) => {
  const baseUrl = process.env.REACT_APP_APPSTORE_URL;
  return `${baseUrl}/${path}`;
}

export const getAppstoreImageUrl = (filename) => {
  return getAppstoreUrl(`/public/images/${filename}`)
}

export const validatePhoneNumber = (value) => {
  // Remove non-numeric characters for validation
  const cleanedValue = value.replace(/\D/g, '');

  if (cleanedValue.startsWith(getLangText("PHONE_PREFIX_1")) || cleanedValue.startsWith(getLangText("PHONE_PREFIX_5")) || cleanedValue.startsWith(getLangText("PHONE_PREFIX_8"))) {
    return cleanedValue.length === 10 && value.length === 12;
  } else {
    return cleanedValue.length === 9 && value.length === 11;
  }
}

export const formatDate = (field, format = DATE_FORMAT) => {
  if (!field) {
    return "";
  }
  return moment(new Date(field)).format(format);
}

export const formatDbDate = (field) => {
  return formatDate(field, 'YYYY-MM-DD');
}

export const formatTime = (field) => {
  if (!field) {
    return "";
  }
  return moment(field).format(TIME_FORMAT);
}

export const formatHhMm = (field) => {
  if (!field) {
    return "";
  }
  return moment(field).format(HHMM_FORMAT);
}

export const convertDateFromString = (date) => {
  return moment(date, 'YYYY-MM-DD').toDate();
}

export const formatDuration = (value) => {
  if (value > 60) {
    return getLangText("FORMAT_DURATION_HHMM", [Math.floor(value / 60), value % 60]);
  }
  return getLangText("FORMAT_DURATION_MM", [value]);
}

/**
 * Tags and attributes a stored rich-text field may keep.
 *
 * Deliberately narrow: enough for what the editor produces - headings,
 * lists, emphasis, links, tables, images - and nothing that executes.
 * <script>, <iframe>, <object>, <form> and every on* handler fall outside
 * the allowlist and are stripped rather than escaped.
 */
const RICH_TEXT_OPTIONS = {
  allowedTags: [
    "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "sub", "sup",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "hr",
    "ul", "ol", "li", "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["style", "align", "colspan", "rowspan"],
  },
  // javascript: and vbscript: hrefs are the classic way an "HTML only"
  // field turns into script execution.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\(/, /^[a-zA-Z]+$/],
      "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\(/, /^[a-zA-Z]+$/],
      "font-size": [/^\d+(\.\d+)?(px|em|rem|%)$/],
      "font-family": [/^[\w\s",-]+$/],
      "text-align": [/^(left|right|center|justify)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
    },
  },
  transformTags: {
    // An external link opened from user-authored content must not hand
    // the opener over with it.
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
  },
};

/**
 * Make a stored HTML field safe to render.
 *
 * Eight places rendered server content straight into dangerouslySetInnerHTML
 * - blog articles, blog replies, feedback messages, FAQ answers, OS release
 * notes - all of which are written by users or by staff through an editor.
 * Any one of them was a stored-XSS delivery point. Everything goes through
 * here now.
 *
 * `breaks` converts newlines to <br>, which is what those call sites were
 * doing by hand; pass false for content that already carries its own
 * paragraph markup.
 */
export const sanitizeRichText = (html, breaks = true) => {
  if (!html) return "";
  const source = breaks ? String(html).replace(/\n/g, "<br />") : String(html);
  return sanitizeHtml(source, RICH_TEXT_OPTIONS);
}

export const checkTextEmpty = (html) => {
  if (!html) {
    return true;
  }
  const cleaned = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim();
  return !cleaned;
}

export const formatNumber = (value, priceFormat = PRICE_FORMAT.WALLET) => {
  if (!value || +value === 0) {
    return "0";
  }
  value += '';
  const list = value.split('.');
  const prefix = list[0].charAt(0) === '-' ? '-' : '';
  let num = prefix ? list[0].slice(1) : list[0];
  let result = '';
  while (num.length > 3) {
    result = ` ${num.slice(-3)}${result}`;
    num = num.slice(0, num.length - 3);
  }
  if (num) {
    result = num + result;
  } else {
    result = "0";
  }

  let below = list[1];
  if (below) {
    if (priceFormat === PRICE_FORMAT.FRONT) {
      below = +("0." + below);
      if (Math.abs(+value) < 0.1) {
        below = below.toFixed(3);
      } else if (Math.abs(+value) < 1) {
        below = below.toFixed(2);
      } else if (Math.abs(+value) < 50) {
        below = below.toFixed(1);
      } else {
        below = below.toFixed(0);
      }
      below = below.slice("0.".length);
    } else if (priceFormat === PRICE_FORMAT.WALLET) {
      below = below.length > 2 ? below.slice(0, 2) : below;
    }
  }
  return `${prefix}${result}${below ? `.${below}` : ''}`;
};

export const formatPrice = (value, priceFormat = PRICE_FORMAT.WALLET) => {
  return formatNumber(value, priceFormat);
}

export const extractPhoneNumberFromMessage = (message) => {
  // Remove non-numeric characters for validation
  const cleanedValue = message.replace(/\D/g, '');
  return cleanedValue;
}

export const getDayDiff = (one, two) => {
  return moment(one).diff(moment(two), 'days');
}

export const getFileName = (str) => {
  let file_names = str.split('-');
  file_names.splice(0, 2);
  return file_names.join('-');
}

export const onDownload = async (file_name, file_path) => {
  const params = { name: file_name, dir: file_path };
  const resp = await downloadFile(params);
  const content = resp.data;
  let elink = document.createElement('a');
  elink.download = getFileName(file_name);
  elink.style.display = 'none';

  let blob = new Blob([content]);
  elink.href = URL.createObjectURL(blob);

  document.body.appendChild(elink);
  elink.click();

  document.body.removeChild(elink);
}

export const hexToBase64 = (str) => {
  var bString = "";
  for (var i = 0; i < str.length; i += 2) {
    bString += String.fromCharCode(parseInt(str.substr(i, 2), 16));
  }
  return btoa(bString);
}

export const checkHello = (text) => {
  if (text.includes(getLangText("TEXT_HELLO")) || text.includes("hello") || text.includes("Hello") || text.includes("HELLO")) {
    return false;
  }
  return true;
}
