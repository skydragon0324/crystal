import { getEnumText } from "lang/lang";

/**
 * Domain labels, bound late.
 *
 * The lists below used to be assembled from label objects imported out of
 * lang/en at module load. That copied English into them before the app had
 * decided which language to run in, so no language switch could ever reach
 * them - and because a missing label silently produced `undefined`, six
 * entries here rendered blank for months: FAIl for FAIL, BASIC_REWARD and
 * BASIC_IN for BASIC_TRANSFER and BASIC_RECEIPT, ECONOMY against a
 * catalogue that spelt it ECOMONY, REQUST for REQUEST, COPIED_BLOG for
 * COPIED. All six are corrected below, and getEnumText now warns instead
 * of returning undefined if one drifts again.
 *
 * `name` is a getter, so the label is read when the entry is rendered
 * rather than when this module is evaluated. The lists are otherwise
 * ordinary arrays of ordinary objects - spread, find, map and
 * JSON.stringify all behave exactly as they did.
 */
const labelledBy = (group) => (key, rest) =>
  Object.defineProperty(Object.assign({}, rest), "name", {
    get: () => getEnumText(group, key),
    enumerable: true,
  });

export const DEFAULT_PAGE_SIZE = 10;
export const DATE_FORMAT = "YYYY-MM-DD";
export const TIME_FORMAT = "YYYY-MM-DD HH:mm";
// Keep a seconds-precision variant for audit and keygen logs,
// where the exact second is meaningful.
export const TIME_SECONDS_FORMAT = "YYYY-MM-DD HH:mm:ss";
export const HHMM_FORMAT = "HH:mm";
export const FLAG_TO_ALL = 1;
export const FLAG_AGENCY = 1;
export const FLAG_ACTIVE = 1;
export const FLAG_NONE = 0;
export const FLAG_DELETED = 1;
export const FLAG_READ = 1;
export const FLAG_LOCKED = 1;
export const FLAG_RESERVABLE = 1;
export const FLAG_PRIVATE = 1;

export const CID_LENGTH = 10;

export const PAGE_ACCOUNT_URL_PREFIX = "/vendor/account/";

// The site's landing route. Six call sites - the logo, both logout
// handlers, the sidebar logo and the root redirect - pointed at
// "/vendor/home" or "/vendor/phone/intro", and ClientRoute defined
// neither, so every one of them rendered a blank page under the header.
// It was pointed at the phone catalogue as a stopgap; there is a real
// landing page behind this route now.
export const PAGE_HOME_URL = "/vendor/home";

// AccountLayout mounts feedback at .../message/feedback_threads; the
// footer and any other deep link must use that exact path.
export const PAGE_FEEDBACK_URL = "/vendor/account/message/feedback_threads";

export const MANAGER_ROLES = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  SUPER: 3,
};

export const ACTION_TYPE = {
  USER: 0,
  MANAGER: 1,
};

export const PRICE_FORMAT = {
  NONE: 0,    // Only number
  WALLET: 1,  // max 3-digits after point
  FRONT: 2,   // Standard
}

const agencyBusiness = labelledBy("AGENCY_BUSINESS");

export const AGENCY_BUSINESS = [
  agencyBusiness("OS", { id: 0, color: "red" }),
  agencyBusiness("REPAIR", { id: 1, color: "yellow" }),
  agencyBusiness("INSURANCE", { id: 2, color: "green" }),
  agencyBusiness("CHANGE", { id: 3, color: "blue" }),
]

export const ESHOP_WALLET_API_TYPE = {
  TRANSACTION: 0,
  EXP_LOG: 1,
  COMMERCE_VALUE: 2,
};

const eshopMoney = labelledBy("ESHOP_MONEY");

export const ESHOP_MONEY_TYPES = [
  eshopMoney("ACCUM", { id: 0 }),
  eshopMoney("WALLET", { id: 3 }),
  eshopMoney("BONUS", { id: 4 }),
];

const eshopFill = labelledBy("ESHOP_FILL");

export const ESHOP_FILL_TYPES = [
  eshopFill("PAY", { type: "pay" }),
  eshopFill("BONUS", { type: "bonus", color: "#87d068" }),
  eshopFill("BACK", { type: "back" }),
  eshopFill("REFUND", { type: "refund", color: "#bfbfbf" }),
  eshopFill("COMBINE", { type: "combine" }),
  eshopFill("TRANSFER", { type: "transfer" }),
];

export const APPSTORE_PURCHASE_TYPE = {
  DIAMOND: "App\\Models\\Diamond",
  APPVERSION: "App\\Models\\AppVersion",
  AVATAR: "App\\Models\\Avatar",
  EVENTITEM: "App\\Models\\EventItem",
  NICKNAME: "App\\Models\\Nickname",
}

const appstorePurchase = labelledBy("APPSTORE_PURCHASE");

export const APPSTORE_PURCHASE_TYPES = [
  appstorePurchase("DIAMOND", { type: APPSTORE_PURCHASE_TYPE.DIAMOND }),
  appstorePurchase("APPVERSION", { type: APPSTORE_PURCHASE_TYPE.APPVERSION }),
  appstorePurchase("AVATAR", { type: APPSTORE_PURCHASE_TYPE.AVATAR }),
  appstorePurchase("EVENTITEM", { type: APPSTORE_PURCHASE_TYPE.EVENTITEM }),
  appstorePurchase("NICKNAME", { type: APPSTORE_PURCHASE_TYPE.NICKNAME }),
];

export const APPSTORE_PURCHASE_STATE = {
  PURCHASED: 0,
  PURCHASING: 1,
}

const appstorePurchaseState = labelledBy("APPSTORE_PURCHASE_STATE");

export const APPSTORE_PURCHASE_STATES = [
  appstorePurchaseState("PURCHASED", { id: APPSTORE_PURCHASE_STATE.PURCHASED }),
  appstorePurchaseState("PURCHASING", { id: APPSTORE_PURCHASE_STATE.PURCHASING }),
];

const licenseState = labelledBy("APPSTORE_LICENSE_STATE");

export const APPSTORE_LICENSE_STATES = [
  licenseState("SUCCESS", { id: 0, color: "green" }),
  licenseState("UNUSED", { id: 1, color: "gray" }),
  licenseState("USED", { id: 2, color: "orange" }),
  licenseState("FAIL", { id: 3, color: "red" }),
  licenseState("REFUND", { id: 4, color: "cyan" }),
  licenseState("PENDING", { id: 5, color: "blue" }),
  licenseState("ACCEPT_PENDING", { id: 6, color: "blue" }),
];

export const APPSTORE_MONEY_TYPE = {
  COMPANY: 1,
  FOREIGN: 3,
};

const walletMoney = labelledBy("APPSTORE_WALLET_MONEY");

export const APPSTORE_MONEY_TYPES = [
  walletMoney("IMMATERIAL", { id: 0, color: "#44ad4c" }),
  walletMoney("COMPANY", { id: APPSTORE_MONEY_TYPE.COMPANY, color: "blue" }),
  walletMoney("NATIONAL", { id: 2, color: "blue" }),
  walletMoney("FOREIGN", { id: APPSTORE_MONEY_TYPE.FOREIGN, color: "red" }),
  walletMoney("MATERIAL", { id: 4, color: "#26a69a" }),
];

const transactionLabel = labelledBy("APPSTORE_TRANSACTION_LABEL");

export const APPSTORE_TRANSACTION_TYPE_LABELS = [
  transactionLabel("ALL", { id: 0 }),
  transactionLabel("PURCHASE", { id: 1 }),
  transactionLabel("CHARGE", { id: 2 }),
  transactionLabel("TRANSFER", { id: 3 }),
  transactionLabel("RECEIVE", { id: 4 }),
];

const transaction = labelledBy("APPSTORE_TRANSACTION");

export const APPSTORE_TRANSACTION_TYPES = [
  transaction("CHARGE", { id: 1, type: "in" }),
  transaction("RECEIPT", { id: 2, type: "in" }),
  transaction("TRANSFER", { id: 3, type: "send" }),
  transaction("RECEIVE", { id: 4, type: "in" }),
  transaction("PURCHASE", { id: 5, type: "pay" }),
  transaction("SMARTPHONE", { id: 6, type: "pay" }),
  transaction("BONUS_REWARD", { id: 7, type: "reward" }),
  transaction("BONUS_IN", { id: 8, type: "in" }),
  transaction("BASIC_TRANSFER", { id: 9, type: "basic" }),
  transaction("BASIC_RECEIPT", { id: 10, type: "in" }),
  transaction("REFUND", { id: 11, type: "in" }),
  transaction("EXCHANGE", { id: 12, type: "in" }),
  transaction("RECOVERY", { id: 13, type: "recovery" }),
  transaction("RESTORE", { id: 14, type: "in" }),
];

export const SOFT_POINT_TYPES = {
  APPSTORE: 0,
  KARAOKE: 1,
  BMEDIA: 2,
  MANAGER: 3,
};

const softPointStatus = labelledBy("SOFT_POINT_STATUS");

export const SOFT_POINT_STATUS_LIST = [
  softPointStatus("CHARGE", { id: 0, color: "green" }),
  softPointStatus("MINUS", { id: 1, color: "pink" }),
  softPointStatus("REFUND", { id: 2, color: "blue" }),
];

const activityPrefix = labelledBy("ACTIVITY_POINT_PREFIX");

export const ACTIVITY_POINT_TYPE_PREFIXES = [
  activityPrefix("ALL", { id: 0 }),
  activityPrefix("FIXED", { id: 10 }),
  activityPrefix("MOBILE", { id: 20 }),
  activityPrefix("BLOG", { id: 30 }),
  activityPrefix("ETC", { id: 99 }),
];

export const FEEDBACK_CATEGORY = {
  PID: 0,
  PHONE_SALE: 1,
  EPROD_REG: 2,
  ESHOP: 3,
  APPSTORE: 4,
  CONTACT: 5,
  PHONE_AS: 6,
  PHONE_REG: 7,
  EPRODUCT: 8,
  BLOG: 9,
  FIXED: 10,
  MARS: 11,
};

// The catalogue group is FEEDBACK_CATEGORY; the old export it read from
// was FEEDBACK_CATEORY_NAME, misspelt consistently enough that it worked.
const feedbackCategory = labelledBy("FEEDBACK_CATEGORY");

export const FEEDBACK_CATEGORIES = [
  feedbackCategory("PID", { id: FEEDBACK_CATEGORY.PID, color: "yellow" }),
  feedbackCategory("PHONE_SALE", { id: FEEDBACK_CATEGORY.PHONE_SALE, color: "blue" }),
  feedbackCategory("PHONE_AS", { id: FEEDBACK_CATEGORY.PHONE_AS, color: "cyan" }),
  feedbackCategory("EPRODUCT", { id: FEEDBACK_CATEGORY.EPRODUCT, color: "green" }),
  feedbackCategory("EPROD_REG", { id: FEEDBACK_CATEGORY.EPROD_REG, color: "green" }),
  feedbackCategory("ESHOP", { id: FEEDBACK_CATEGORY.ESHOP, color: "pink" }),
  feedbackCategory("MARS", { id: FEEDBACK_CATEGORY.MARS, color: "pink" }),
  feedbackCategory("APPSTORE", { id: FEEDBACK_CATEGORY.APPSTORE, color: "orange" }),
  feedbackCategory("PHONE_REG", { id: FEEDBACK_CATEGORY.PHONE_REG, color: "orange" }),
  feedbackCategory("BLOG", { id: FEEDBACK_CATEGORY.BLOG, color: "purple" }),
  feedbackCategory("FIXED", { id: FEEDBACK_CATEGORY.FIXED, color: "blue" }),
  // feedbackCategory("CONTACT", { id: FEEDBACK_CATEGORY.CONTACT, color: "cyan" }),
];

export const FEEDBACK_THREAD_STATUS = {
  DISCUSSING: 0,
  RESOLVED: 1,
  FINISHED: 2,
};

const threadStatus = labelledBy("FEEDBACK_THREAD_STATUS");

export const FEEDBACK_THREAD_STATUS_LIST = [
  threadStatus("DISCUSSING", { id: FEEDBACK_THREAD_STATUS.DISCUSSING, color: "pink" }),
  threadStatus("RESOLVED", { id: FEEDBACK_THREAD_STATUS.RESOLVED, color: "green" }),
  threadStatus("FINISHED", { id: FEEDBACK_THREAD_STATUS.FINISHED, color: "gray" }),
];

export const BLOG_OLD_TYPE = {
  ALL: 0,
  BBS: 1,
  BLOG: 2,
};

const blogCategory = labelledBy("BLOG_OLD_CATEGORY");

export const BLOG_OLD_CATEGORIES = [
  blogCategory("DISCUSS", { id: 1 }),
  blogCategory("PRODUCT", {
    id: 2,
    sub_categories: [
      blogCategory("PROD_PHONE", { id: 21 }),
      blogCategory("PROD_TV", { id: 22 }),
      blogCategory("PROD_COMPUTER", { id: 23 }),
      blogCategory("PROD_ETC", { id: 24 }),
    ],
  }),
  blogCategory("IT", { id: 3 }),
  blogCategory("SCIENCE", { id: 4 }),
  // ECONOMY: the catalogue used to spell this ECOMONY, so this entry
  // rendered as nothing at all.
  blogCategory("ECONOMY", { id: 5 }),
  blogCategory("HELP", { id: 6 }),
];

const blogHelpStatus = labelledBy("BLOG_OLD_HELP_STATUS");

export const BLOG_OLD_HELP_STATUS = [
  blogHelpStatus("INPROGRESS", { id: 0, color: "blue" }),
  blogHelpStatus("RESOLVED", { id: 1, color: "#36d964" }),
  blogHelpStatus("FINISHED", { id: 2, color: "green" }),
  blogHelpStatus("CORRECT", { id: 3, color: "#36d964" }),
  blogHelpStatus("VERIFYING", { id: 4, color: "#5295fa" }),
];

export const BLOG_OLD_PUB_STATUS = {
  ALL: -1,
  REQUEST: 0,
  ADMIN_AGREE: 1,
  ADMIN_DENY: 2,
  PENDING: 3,
  PUB_AGREE: 4,
  PUB_DENY: 5,
  PUB_CANCEL: 6,
  PUB_PENDING: 7,
  COPIED_BLOG: 8,
  ADMIN_DENYING: 9,
  REQUESTING_COPIED_BLOG: 10,
  TEMP: -2
};

const blogStatus = labelledBy("BLOG_OLD_STATUS");

export const BLOG_OLD_STAT_LIST = [
  // REQUEST and COPIED_BLOG were REQUST and a key the catalogue called
  // COPIED; both rendered blank.
  blogStatus("REQUEST", { id: BLOG_OLD_PUB_STATUS.REQUEST, color: "cyan" }),
  blogStatus("ADMIN_AGREE", { id: BLOG_OLD_PUB_STATUS.ADMIN_AGREE, color: "blue" }),
  blogStatus("ADMIN_DENY", { id: BLOG_OLD_PUB_STATUS.ADMIN_DENY, color: "red" }),
  blogStatus("PENDING", { id: BLOG_OLD_PUB_STATUS.PENDING, color: "blue" }),
  blogStatus("PUB_AGREE", { id: BLOG_OLD_PUB_STATUS.PUB_AGREE, color: "green" }),
  blogStatus("PUB_DENY", { id: BLOG_OLD_PUB_STATUS.PUB_DENY, color: "red" }),
  blogStatus("PUB_CANCEL", { id: BLOG_OLD_PUB_STATUS.PUB_CANCEL, color: "red" }),
  blogStatus("PUB_PENDING", { id: BLOG_OLD_PUB_STATUS.PUB_PENDING, color: "blue" }),
  blogStatus("COPIED_BLOG", { id: BLOG_OLD_PUB_STATUS.COPIED_BLOG, color: "pink" }),
  blogStatus("REQ_COPIED_BLOG", { id: BLOG_OLD_PUB_STATUS.REQUESTING_COPIED_BLOG, color: "pink" }),
  blogStatus("ADMIN_DENYING", { id: BLOG_OLD_PUB_STATUS.ADMIN_DENYING, color: "blue" }),
  blogStatus("TEMP", { id: BLOG_OLD_PUB_STATUS.TEMP, color: "pink" }),
];

const eprodRegisterStatus = labelledBy("EPROD_REGISTER_STATUS");

export const EPROD_REGISTER_STATUS = [
  eprodRegisterStatus("PENDING", { id: 0, color: "gray" }),
  eprodRegisterStatus("APPROVE", { id: 1, color: "blue" }),
  eprodRegisterStatus("DENY", { id: 2, color: "pink" }),
  eprodRegisterStatus("TRANSFER", { id: 3, color: "yellow" }),
  eprodRegisterStatus("DELETE", { id: 4, color: "red" }),
  eprodRegisterStatus("VERIFY", { id: 5, color: "green" }),
];

export const EPROD_FEEDBACK_STATUS = {
  NONE: 0,
  PENDING: 1,
  ACCEPT: 2,
  REJECT: 3,
};

const eprodFeedbackState = labelledBy("EPROD_FEEDBACK_STATE");

export const EPROD_FEEDBACK_STATES = [
  eprodFeedbackState("NONE", { id: EPROD_FEEDBACK_STATUS.NONE, color: "pink" }),
  eprodFeedbackState("PENDING", { id: EPROD_FEEDBACK_STATUS.PENDING, color: "blue" }),
  eprodFeedbackState("ACCEPT", { id: EPROD_FEEDBACK_STATUS.ACCEPT, color: "green" }),
  eprodFeedbackState("REJECT", { id: EPROD_FEEDBACK_STATUS.REJECT, color: "red" }),
];
