/**
 * English catalogue.
 *
 * A locale is a plain object with four parts, and every locale added later
 * has the same shape:
 *
 *   code      the tag used in the URL / localStorage / <html lang>
 *   name      how the language names itself in a language picker
 *   intlTag   the BCP-47 tag handed to Intl for number and date formatting
 *   messages  UI strings, keyed by SCREAMING_SNAKE_CASE
 *   enums     labels for domain codes the API returns as integers
 *   responses HTTP-ish status text
 *
 * `messages` is assembled from sections rather than written as one flat
 * literal. The sections are only an authoring convenience - they are
 * flattened before export, so a call site still asks for a bare key and
 * nothing has to know which section a key lives in.
 *
 * To add a language, copy this file to ./xx.js, translate the values, and
 * register it in ./index.js. Missing keys fall back to English rather than
 * rendering blank, so a partial translation is safe to ship.
 */

/* ---------------------------------------------------------------- *
 * Rich text editor
 * ---------------------------------------------------------------- */
const EDITOR = {
  TEXT_EDITOR_GENERIC_ADD: "Add",
  TEXT_EDITOR_GENERIC_CANCEL: "Cancel",
  TEXT_EDITOR_BLOCKTYPE_H1: "H1",
  TEXT_EDITOR_BLOCKTYPE_H2: "H2",
  TEXT_EDITOR_BLOCKTYPE_H3: "H3",
  TEXT_EDITOR_BLOCKTYPE_H4: "H4",
  TEXT_EDITOR_BLOCKTYPE_H5: "H5",
  TEXT_EDITOR_BLOCKTYPE_H6: "H6",
  TEXT_EDITOR_BLOCKTYPE_BLOCKQUOTE: "Block Quote",
  TEXT_EDITOR_BLOCKTYPE_CODE: "Code",
  TEXT_EDITOR_BLOCKTYPE_BLOCKTYPE: "Block Type",
  TEXT_EDITOR_BLOCKTYPE_NORMAL: "Normal",
  TEXT_EDITOR_COLORPICKER_PICKER: "Color Picker",
  TEXT_EDITOR_COLORPICKER_TEXT: "Text",
  TEXT_EDITOR_COLORPICKER_BACKGROUND: "Background",
  TEXT_EDITOR_FONTFAMILY_FAMILY: "FontFamily",
  TEXT_EDITOR_FONTSIZE_SIZE: "FontSize",
  TEXT_EDITOR_HISTORY_HISTORY: "History",
  TEXT_EDITOR_HISTORY_UNDO: "Undo",
  TEXT_EDITOR_HISTORY_REDO: "Redo",
  TEXT_EDITOR_INLINE_BOLD: "Bold",
  TEXT_EDITOR_INLINE_ITALIC: "Italic",
  TEXT_EDITOR_INLINE_UNDERLINE: "Underline",
  TEXT_EDITOR_INLINE_STRIKETHROUGH: "Strikethrough",
  TEXT_EDITOR_INLINE_SUPERSCRIPT: "Superscript",
  TEXT_EDITOR_INLINE_SUBSCRIPT: "Subscript",
  TEXT_EDITOR_LIST_UNORDERED: "Unordered",
  TEXT_EDITOR_LIST_ORDERED: "Ordered",
  TEXT_EDITOR_LIST_INDENT: "Indent",
  TEXT_EDITOR_LIST_OUTDENT: "Outdent",
  TEXT_EDITOR_REMOVE_REMOVE: "Remove",
  TEXT_EDITOR_ALIGN_TEXTALIGN: "Text Align",
  TEXT_EDITOR_ALIGN_LEFT: "Left",
  TEXT_EDITOR_ALIGN_CENTER: "Center",
  TEXT_EDITOR_ALIGN_RIGHT: "Right",
  TEXT_EDITOR_ALIGN_JUSTIFY: "Justify",
};

/* ---------------------------------------------------------------- *
 * Calendar
 *
 * Weekday and month names are looked up by key from DatePicker. Intl
 * could produce these from the locale tag, but the picker wants the
 * three-letter form at a fixed width and Intl's abbreviations vary by
 * locale data, so they stay as translatable strings.
 * ---------------------------------------------------------------- */
const CALENDAR = {
  TEXT_SUNDAY: "Sun",
  TEXT_MONDAY: "Mon",
  TEXT_TUESDAY: "Tue",
  TEXT_WEDNESDAY: "Wed",
  TEXT_THURSDAY: "Thu",
  TEXT_FRIDAY: "Fri",
  TEXT_SATURDAY: "Sat",
  TEXT_JANUARY: "Jan",
  TEXT_FEBRUARY: "Feb",
  TEXT_MARCH: "Mar",
  TEXT_APRIL: "Apr",
  TEXT_MAY: "May",
  TEXT_JUNE: "Jun",
  TEXT_JULY: "Jul",
  TEXT_AUGUST: "Aug",
  TEXT_SEPTEMBER: "Sep",
  TEXT_OCTOBER: "Oct",
  TEXT_NOVEMBER: "Nov",
  TEXT_DECEMBER: "Dec",

  // Kept because DatePicker's MONTH_KEYS still spells February this way.
  // Aliases are cheap; a blank month name is not.
  TEXT_FEBRARY: "Feb",
};

/* ---------------------------------------------------------------- *
 * Common vocabulary
 * ---------------------------------------------------------------- */
const COMMON = {
  DEFAULT_FONTFAMILY: "Arial",
  OPERATION_SUCCESS: "Operation Successed",
  OPERATION_FAIL: "Operation Failed",
  TEXT_DOWNLOAD: "Download",
  TEXT_GOTO: "Goto",
  TEXT_TOTAL_ROWS: "Total {count} rows",
  TEXT_NO_AUTH: "Please login",
  TEXT_NO_PERM: "No permission",
  TEXT_NO_CONTENT: "No content",
  TEXT_CONTENT: "Content",
  TEXT_NO_ITEM: "No item",
  TEXT_NONE: "None",
  TEXT_OK: "Ok",
  TEXT_CANCEL: "Cancel",
  TEXT_EDIT: "Edit",
  TEXT_SAVE: "Save",
  TEXT_DELETE: "Delete",
  TEXT_RESTORE: "Restore",
  TEXT_SEND: "Send",
  TEXT_ACTION: "Action",
  TEXT_SORT: "Sort",
  TEXT_REQUIRED: "Required",
  TEXT_USERID: "UserId",
  TEXT_PASSWORD: "Password",
  TEXT_LOGIN: "Login",
  TEXT_SUCCESS: "Success",
  TEXT_FAIL: "Fail",
  TEXT_ERROR: "Error",
  TEXT_PHONE_NUMBER: "Phone Number",
  TEXT_HELLO: "Hello",
  TEXT_ALL: "All",
  TEXT_NO: "No",
  TEXT_NAME: "Name",
  TEXT_AGENCY: "Agency",
  TEXT_IS_AGENCY: "Is agency",
  TEXT_USER: "User",
  TEXT_ACTIVITY_POINT: "Activity Points",
  TEXT_REASON: "Reason",
  TEXT_TIME: "Time",
  TEXT_PAY_TIME: "Pay Time",
  TEXT_CREATED_TIME: "Created at",
  TEXT_UPDATED_TIME: "Updated at",
  TEXT_PURCHASE_TIME: "Purchase Time",
  TEXT_REGISTER_TIME: "Register Time",
  TEXT_ORDER_TIME: "Order Time",
  TEXT_PERIOD: "Period",
  TEXT_CATEGORY: "Category",
  TEXT_IMAGE: "Image",
  TEXT_STATUS: "Status",
  TEXT_TYPE: "Type",
  TEXT_APPROVED: "Approved",
  TEXT_NON_APPROVED: "Non Approved",
  TEXT_EQU_NUM: "Equip Number",
  TEXT_SN: "SN",
  TEXT_PURCHASE_FAILED: "Purchase Failed",
  TEXT_LICENSE_INFO: "License",
  TEXT_TRANSFER: "Transfer",
  TEXT_DETAIL: "Detail",
  TEXT_CONTACT_NUM: "Contact Num",
  TEXT_ADDRESS: "Address",
  TEXT_UNIT_COUNT: "",
  TEXT_UNIT_AGE: "years old",
  TEXT_TITLE: "Title",
  TEXT_RETRY: "Retry",
  TEXT_QUANTITY: "Quantity",
  TEXT_API_ERROR: "API failed",
  TEXT_LOADING: "Loading...",
  TEXT_LIGHT_MODE: "Light mode",
  TEXT_DARK_MODE: "Dark mode",
  TEXT_LANGUAGE: "Language",
  PLACEHOLDER_SEARCH: "Please input keyword",
  FORMAT_MONTH_YEAR: "{year}-{month}",
  FORMAT_DURATION_HHMM: "{hours}hour {minutes}min",
  FORMAT_DURATION_MM: "{minutes}min",
  PHONE_PREFIX_1: "1",
  PHONE_PREFIX_5: "5",
  PHONE_PREFIX_8: "8",
  LINE_PREFIX_1: "1",
  COMPANY_NAME: "Company",
};

/* ---------------------------------------------------------------- *
 * Plural forms
 *
 * A key ending in _ONE / _OTHER is a plural set, picked by
 * getLangPlural() through Intl.PluralRules. English needs two forms;
 * a locale that needs _FEW or _MANY simply adds those keys and the
 * runtime finds them.
 * ---------------------------------------------------------------- */
const PLURALS = {
  COUNT_ROW_ONE: "{count} row",
  COUNT_ROW_OTHER: "{count} rows",
  COUNT_ITEM_ONE: "{count} item",
  COUNT_ITEM_OTHER: "{count} items",
  COUNT_SELECTED_ONE: "{count} selected",
  COUNT_SELECTED_OTHER: "{count} selected",
};

/* ---------------------------------------------------------------- *
 * Shared form controls - SelectField, DatePicker
 * ---------------------------------------------------------------- */
const FORMS = {
  SELECT_PLACEHOLDER: "Select...",
  SELECT_SEARCH: "Search...",
  SELECT_NO_RESULTS: "No matches",
  SELECT_CLEAR: "Clear",
  SELECT_SELECT_ALL: "Select all",
  SELECT_CLEAR_ALL: "Clear all",
  SELECT_SELECTED_COUNT: "{count} selected",
  SELECT_TRUNCATED: "{count} more - keep typing to narrow the list",
  DATE_PLACEHOLDER: "Pick a date",
  DATE_OPEN: "Open the calendar",
  DATE_CLEAR: "Clear the date",
  DATE_TODAY: "Today",
  DATE_PREV: "Previous",
  DATE_NEXT: "Next",
};

/* ---------------------------------------------------------------- *
 * DataTable and Pagination
 * ---------------------------------------------------------------- */
const TABLE = {
  TABLE_VIEW_TABLE: "Table view",
  TABLE_VIEW_CARD: "Card view",
  TABLE_RESIZE_COLUMN: "Drag to resize, double-click to reset",
  TABLE_MORE_ACTIONS: "More actions",
  PAGINATION_SHOWING: "{from}-{to} of {total}",
  PAGINATION_EMPTY: "Nothing to show",
  PAGINATION_PAGE_SIZE: "Rows",
  PAGINATION_PAGE_OF: "Page {page} of {pages}",
  PAGINATION_PREV: "Previous page",
  PAGINATION_NEXT: "Next page",
  PAGINATION_GO: "Go",
};

/* ---------------------------------------------------------------- *
 * Carousel
 * ---------------------------------------------------------------- */
const CAROUSEL = {
  CAROUSEL_PLAY: "Play the slideshow",
  CAROUSEL_PAUSE: "Pause the slideshow",
  CAROUSEL_PREV: "Previous slide",
  CAROUSEL_NEXT: "Next slide",
  CAROUSEL_GOTO: "Go to slide {index}",
  CAROUSEL_LABEL: "Featured products",
};

/* ---------------------------------------------------------------- *
 * Navigation
 * ---------------------------------------------------------------- */
const MENU = {
  MENU_HOME_PHONE: "Phone",
  MENU_HOME_EPROD: "Eproduct",
  MENU_HOME_ESHOP: "Eshop",
  MENU_HOME_APPSTORE: "Appstore",
  MENU_HOME_BLOG: "Blog",
  MENU_HOME_INTRO: "Intro",
  MENU_PHONE_PRODUCT: "Products",
  MENU_PHONE_AGENCY: "Agencies",
  MENU_PHONE_FAQ: "FAQs",
  MENU_ACCOUNT_ESHOP: "Eshop",
  MENU_ACCOUNT_APPSTORE: "Appstore",
  MENU_ACOCUNT_EPROD: "Eproduct",
  MENU_ACOCUNT_POINT: "Points",
  MENU_ACOCUNT_SOFTWARE: "Software",
  MENU_ACOCUNT_ACTIVITY: "Activity",
  MENU_ACOCUNT_BLOG: "Blog",
  MENU_ACOCUNT_FEEDBACK: "Feedback",
  MENU_ESHOP_CARD: "Cards",
  MENU_ESHOP_ORDER: "Orders",
  MENU_ESHOP_TRANSACTION: "Transactions",
  MENU_ESHOP_EXP_LOG: "Experience Log",
  MENU_ESHOP_COMMERCE_VALUE: "Commerce Values",
  MENU_APPSTORE_PURCHASE: "Purchases",
  MENU_APPSTORE_COMMENT: "Comments",
  MENU_APPSTORE_FAVORITE: "Favorites",
  MENU_EPROD_REGISTER: "Register",
  MENU_EPROD_KARAOKE: "Karaoke",
  MENU_EPROD_MB_KEYGEN: "Keygen",
  MENU_EPROD_BMEDIA: "Media",
  MENU_POINT_CHARGE: "Charge",
  MENU_POINT_TRANSFER: "Transfer",
  MENU_SOFT_APPSTORE: "Appstore",
  MENU_SOFT_KARAOKE: "Karaoke",
  MENU_SOFT_MEDIA: "Media",
  MENU_SOFT_MINUS: "Minus",
  MENU_SOFT_KARA_OLD: "Kara (Old)",
  MENU_SOFT_MEDIA_OLD: "Media (Old)",
  MENU_ACTIVITY_POINT_LOG: "Activity Point Log",
  MENU_ACTIVITY_OLD_LOG: "Activity Old Log",
  MENU_BLOG_MINE: "My Articles",
  MENU_BLOG_DRAFT: "Drafts",
  MENU_MYINFO: "My Info",
  MENU_LOGOUT: "Logout",
  MENU_LOGIN: "Login",
  MENU_MAINMENU: "Main Menu",
  MENU_ACCOUNT: "Account",
  MENU_SEARCH: "Search",
  MENU_CLOSE: "Close",
  MENU_SKIP_TO_CONTENT: "Skip to content",
};

/* ---------------------------------------------------------------- *
 * Site chrome - header, footer
 * ---------------------------------------------------------------- */
const CHROME = {
  HEADER_ANNOUNCE: "Free delivery on orders over 300,000 - authorised service centres nationwide",
  HEADER_SUPPORT: "Support",
  HEADER_MY_ACCOUNT: "My Account",
  HEADER_SIGN_IN: "Sign in",
  HEADER_SIGNED_IN_AS: "Signed in as",

  FOOTER_SERVICE_TITLE: "Customer service",
  FOOTER_SERVICE_HOURS: "Mon - Sat, 09:00 - 18:00",
  FOOTER_SERVICE_PHONE: "191-000-1234",
  FOOTER_CONTACT_US: "Contact us",
  FOOTER_HELP_CENTER: "Help centre",
  FOOTER_COL_PRODUCTS: "Products",
  FOOTER_COL_SUPPORT: "Support",
  FOOTER_COL_ABOUT: "About",
  FOOTER_COL_COMMUNITY: "Community",
  FOOTER_LINK_PHONES: "Phones",
  FOOTER_LINK_ACCESSORIES: "Accessories",
  FOOTER_LINK_ESHOP: "Eshop",
  FOOTER_LINK_APPSTORE: "Appstore",
  FOOTER_LINK_EPROD: "Eproduct",
  FOOTER_LINK_SERVICE_CENTRES: "Service centres",
  FOOTER_LINK_FAQ: "FAQs",
  FOOTER_LINK_WARRANTY: "Warranty",
  FOOTER_LINK_OS_UPDATES: "OS updates",
  FOOTER_LINK_FEEDBACK: "Feedback",
  FOOTER_LINK_ABOUT_US: "About us",
  FOOTER_LINK_NEWS: "News",
  FOOTER_LINK_CAREERS: "Careers",
  FOOTER_LINK_BLOG: "Blog",
  FOOTER_LINK_FORUM: "Forum",
  FOOTER_LINK_HONOR: "Contributors",
  FOOTER_PRIVACY: "Privacy Policy",
  FOOTER_TERMS: "Terms of Use",
  FOOTER_LEGAL: "Legal",
  FOOTER_SITEMAP: "Sitemap",
  FOOTER_RIGHTS: "All rights reserved.",
  FOOTER_BACK_TO_TOP: "Back to top",
};

/* ---------------------------------------------------------------- *
 * Sign in
 * ---------------------------------------------------------------- */
const AUTH = {
  PASSWORD_MISMATCH: "Password mismatch",
  PASSWORD_ERR_MIN_LEN: "Password should be over {min} chars",
  USER_ERR_NO_USERID: "UserId not exist.",
  LOGIN_TITLE: "Welcome back",
  LOGIN_SUBTITLE: "Sign in to manage your orders, points and devices.",
  LOGIN_SHOW_PASSWORD: "Show password",
  LOGIN_HIDE_PASSWORD: "Hide password",
  LOGIN_HELP: "Trouble signing in?",
  LOGIN_BACK_TO_SITE: "Back to the store",
  LOGIN_ASIDE_TITLE: "One account for everything",
  LOGIN_ASIDE_BODY: "Orders, warranty, points and downloads live behind a single sign-in.",
  LOGIN_ASIDE_POINT_1: "Track orders and service requests",
  LOGIN_ASIDE_POINT_2: "Manage licences and downloads",
  LOGIN_ASIDE_POINT_3: "Spend and transfer points",
};

/* ---------------------------------------------------------------- *
 * Storefront - phone pages
 * ---------------------------------------------------------------- */
const STORE = {
  PHONE_ACCESSARY_NAME: "Accessary",
  PHONE_RESOURCE_PRICE: "Resource",
  PHONE_SERVICE_PRICE: "Service",
  PHONE_PRICE_ALLOW_NUM: "Allow Number",
  PHONE_PRICE_ON_REQUEST: "Price on request",
  PHONE_PRODUCTS_TITLE: "Phones",
  PHONE_PRODUCTS_SUBTITLE: "Every model we sell, with current pricing.",
  PHONE_EMPTY_CATEGORY: "Nothing in this range yet.",
  FAQ_SUBTITLE: "Answers to the questions the service desk hears most.",
  AGENCY_TITLE: "Service centres",
  AGENCY_SUBTITLE: "Authorised repair and support, province by province.",
  AGENCY_EMPTY: "No centres listed for this province yet.",
  AGENCY_PROVINCE: "Province",
  DETAIL_TAB_SPEC: "Specification",
  DETAIL_TAB_IMAGE: "Gallery",
  DETAIL_TAB_PRICE: "Service pricing",
  DETAIL_TAB_OS: "OS history",
  DETAIL_BACK: "All phones",
  OS_HISTORY_EMPTY: "No release notes for this model yet.",
  OS_HISTORY_BUILD: "Build",
  SERVICE_COST_EMPTY: "No service pricing published for this model.",

  // Hero carousel. Four slides, so four sets - the deck is content, and
  // content belongs in the catalogue rather than in the page component.
  PHONE_HERO_EYEBROW: "New arrival",
  PHONE_HERO_CTA: "See the range",
  PHONE_HERO_CTA_SERVICE: "Find a centre",
  PHONE_HERO_CTA_SUPPORT: "Get support",
  PHONE_HERO_1_TITLE: "The S-9 series",
  PHONE_HERO_1_SUB: "A brighter panel, a bigger battery, and a camera tuned for the dark.",
  PHONE_HERO_2_EYEBROW: "Camera",
  PHONE_HERO_2_TITLE: "Shoot after sunset",
  PHONE_HERO_2_SUB: "Three sensors and on-device processing that keeps the grain out.",
  PHONE_HERO_3_EYEBROW: "Battery",
  PHONE_HERO_3_TITLE: "Two days on a charge",
  PHONE_HERO_3_SUB: "5,000 mAh, and sixty per cent back in half an hour.",
  PHONE_HERO_4_EYEBROW: "Service",
  PHONE_HERO_4_TITLE: "Repairs, wherever you are",
  PHONE_HERO_4_SUB: "Authorised centres nationwide, most walk-in repairs done the same day.",
};

/* ---------------------------------------------------------------- *
 * Home page
 *
 * The landing page is almost entirely copy, so it is almost entirely
 * here. Nothing in HomePage.js hard-codes a sentence - a section can be
 * reworded, or translated, without opening the component.
 * ---------------------------------------------------------------- */
const HOME = {
  HOME_HERO_1_EYEBROW: "Now shipping",
  HOME_HERO_1_TITLE: "The S-9, in three finishes",
  HOME_HERO_1_SUB: "Our brightest panel yet, and a battery that lasts the weekend.",
  HOME_HERO_1_CTA: "Shop the S-9",
  HOME_HERO_2_EYEBROW: "Trade in",
  HOME_HERO_2_TITLE: "Your old phone is worth something",
  HOME_HERO_2_SUB: "Bring it to any service centre and put the value straight into a new one.",
  HOME_HERO_2_CTA: "Find a centre",
  HOME_HERO_3_EYEBROW: "Points",
  HOME_HERO_3_TITLE: "Every purchase earns",
  HOME_HERO_3_SUB: "Points from the shop, the app store and registrations all land in one wallet.",
  HOME_HERO_3_CTA: "Open my account",
  HOME_HERO_4_EYEBROW: "Support",
  HOME_HERO_4_TITLE: "Same-day repairs, nationwide",
  HOME_HERO_4_SUB: "Authorised centres in every province, with genuine parts and a real warranty.",
  HOME_HERO_4_CTA: "Get support",

  HOME_HERO_LABEL: "Featured offers",
  HOME_SHORTCUT_PHONES: "Phones",
  HOME_SHORTCUT_ESHOP: "Eshop",
  HOME_SHORTCUT_APPSTORE: "Appstore",
  HOME_SHORTCUT_EPROD: "Eproduct",
  HOME_SHORTCUT_BLOG: "Blog",
  HOME_SHORTCUT_SUPPORT: "Support",

  HOME_FEATURED_TITLE: "Popular right now",
  HOME_FEATURED_SUB: "The models moving fastest this month.",
  HOME_FEATURED_EMPTY: "No products to show yet.",
  HOME_SEE_ALL: "See all",

  HOME_PROMO_TITLE: "Worth a look",
  HOME_PROMO_1_TITLE: "Accessories that fit",
  HOME_PROMO_1_BODY: "Cases, chargers and cables matched to your exact model.",
  HOME_PROMO_2_TITLE: "Two years of cover",
  HOME_PROMO_2_BODY: "Extend the warranty on any handset within thirty days of purchase.",
  HOME_PROMO_3_TITLE: "Software and licences",
  HOME_PROMO_3_BODY: "Keys, downloads and renewals, all in one place.",
  HOME_PROMO_CTA: "Learn more",

  HOME_VALUE_1_TITLE: "Free delivery",
  HOME_VALUE_1_BODY: "On orders over 300,000",
  HOME_VALUE_2_TITLE: "Genuine warranty",
  HOME_VALUE_2_BODY: "Twelve months, parts and labour",
  HOME_VALUE_3_TITLE: "Nationwide service",
  HOME_VALUE_3_BODY: "Authorised centres in every province",
  HOME_VALUE_4_TITLE: "Secure payment",
  HOME_VALUE_4_BODY: "Wallet, card or points",

  HOME_BLOG_TITLE: "From the blog",
  HOME_BLOG_SUB: "Guides, release notes and community writing.",
  HOME_BLOG_EMPTY: "Nothing published yet.",
  HOME_BLOG_READ: "Read",

  HOME_CTA_TITLE: "Not sure which model?",
  HOME_CTA_BODY: "Compare specifications side by side, or ask the team at your nearest service centre.",
  HOME_CTA_PRIMARY: "Compare phones",
  HOME_CTA_SECONDARY: "Ask a question",
};

/* ---------------------------------------------------------------- *
 * Account areas
 * ---------------------------------------------------------------- */
const ACCOUNT = {
  APPSTORE_COMMENTED_APP: "Commented apps",
  APPSTORE_RATING: "Rating",
  APPSTORE_COMMENT: "Comment",
  APPSTORE_COMMENT_TIME: "Time",
  APPSTORE_PAY_POINT: "Pay points",
  APPSTORE_PAY_PRICE: "Pay Price",
  APPSTORE_SOFT_POINT: "Soft points",
  APPSTORE_WALLET_MONEY: "Money",
  APPSTORE_WALLET_TYPE: "Type",
  APPSTORE_WALLET_TRAN_TYPE: "Transaction Type",
  APPSTORE_WALLET_TRAN_NO: "Transaction No",
  APPSTORE_WALLET_TRAN_DETAIL: "Transaction Detail",
  APPSTORE_WALLET_TRAN_TIME: "Transaction Time",
  APPSTORE_WALLET_MONEY_IMMATERIAL: "Immaterial Points",
  APPSTORE_WALLET_MONEY_COMPANY: "Company Points",
  APPSTORE_WALLET_TRANSFER: "Transfer",
  APPSTORE_WALLET_TRANSFER_DESC: "Do you want to transfer to {receiver} with {points} points?",
  APPSTORE_WALLET_RECEIVER_ID: "Receiver ID",
  APPSTORE_WALLET_TRANSFER_POINT: "Point to transfer",
  APPSTORE_WALLET_PASSWORD: "Wallet Password",
  APPSTORE_ERR_GET_LICENSE: "Fail to get license for purchase log.",
  APPSTORE_DOWNLOAD_LICENSE: "Download license",
  APPSTORE_SAVE_LICENSE: "Save as image",
  WALLET_SH: "Wallet SH",
  WALLET_MM: "Wallet MM",
  WALLET_UR: "Wallet UR",
  WALLET_SY: "Wallet SY",

  BLOG_TYPE_BLOG: "Blog",
  BLOG_TYPE_BBS: "BBS",
  BLOG_ARTICLE_HELP: "Help Article",
  BLOG_ARTICLE_NORMAL: "Normal",
  BLOG_ARTICLE_TYPE: "Article Type",
  BLOG_ARTICLE_NEW: "New",
  BLOG_ARTICLE_REPLY: "Reply",
  BLOG_HELP_STATUS: "Help Status",
  BLOG_REPLY_ARTICLES: "Reply articles",
  BLOG_SUBJECT: "Subject",
  BLOG_SUBMIT: "Submit",
  BLOG_SUBMIT_BTN: "Blog Submit",
  BLOG_REPLY_BTN: "Reply",
  BLOG_CONFIRM_DELETE: "Do you want to delete '{title}'?",
  BLOG_ORIGIN: "Origin",
  BLOG_DENY_REASON: "Deny Reason",
  BLOG_CATEGORY_HELP: "Help Request",
  BLOG_REQUIRE_TITLE: "Please input title",
  BLOG_REQUIRE_ORIGIN: "Please input origin.",
  BLOG_REQUIRE_CONTENT: "Please input content.",
  BLOG_REQUIRE_HELLO: "Please input hello.",
  BLOG_REQUIRE_CATEGORY: "Please select the category.",
  BLOG_SAVE_DRAFT: "Save draft",
  BLOG_TO_LIST: "To list",
  BLOG_SORT_TIME: "By Time",
  BLOG_SORT_REPLY: "By Reply count",
  BLOG_SORT_VISIT: "By Visit count",
  BLOG_SORT_THUMB: "By Thumb count",
  BLOG_LIST_SUBTITLE: "Guides, release notes and community writing.",
  BLOG_EMPTY: "No articles match this filter.",
  BLOG_ADMIN_RECOMM: "Recommended",
  BLOG_MONTHLY_AUTHOR: "Monthly authors",
  BLOG_ASSIST: "Blog Assist",
  BLOG_ASSIST_1: "1. AAA",
  BLOG_ASSIST_2: "2. AAA",
  BLOG_ASSIST_3: "3. AAA",
  BLOG_ASSIST_4: "4. AAA",
  BLOG_THUMB_SUCCESS: "Successfully thumb up",

  MEDIA_PROVIDER: "Media Provider",
  MEDIA_DURATION: "Duration",
  MEDIA_PRICE: "Price",

  EPROD_IS_AGENCY: "Is agency",
  EPROD_PAY_POINT: "Pay points",
  EPROD_SOFT_POINT: "Soft points",
  EPROD_PRODUCT_NAME: "Product Name",
  EPROD_REG_POINT: "Register Points",
  EPROD_TRAN_NO: "Transaction Id",
  EPROD_ERR_REPORT: "Error report",

  ESHOP_COMMERCE_VALUE: "Commerce Value",
  ESHOP_MONEY_TYPE: "Money Type",
  ESHOP_FILL_TYPE: "Fill Type",
  ESHOP_EXP_INCREMENT: "Increment",
  ESHOP_ACCUM_CARD: "Customer Card",
  ESHOP_WALLET_CARD: "Wallet Card",
  ESHOP_WALLET_BALANCE: "Wallet Balance",
  ESHOP_PRIZE_VALUE: "Prize Value",
  ESHOP_EXP_VALUE: "Exp Value",
  ESHOP_GOOD_FOREIGN: "Foreign goods",
  ESHOP_GOOD_NATIVE: "Native goods",
  ESHOP_GOOD_POINT: "Point goods",
  ESHOP_GOOD_NAME: "Good Name",
  ESHOP_GOOD_IMAGE: "Good Image",
  ESHOP_GOOD_STANDARD: "Standard",
  ESHOP_GOOD_PRICE: "Good Price",
  ESHOP_PRICE: "Price",
  ESHOP_ADDRESS: "Delivery Address",
  ESHOP_CANCEL_USER: "User cancel reason",
  ESHOP_CANCEL_MANAGER: "Manager cancel reason",

  FEEDBACK_LAST_MESSAGE: "Last message",
  FEEDBACK_CHAT: "Chat",
  FEEDBACK_THREAD: "Thread",
  FEEDBACK_LIST: "Feedback List",
  FEEDBACK_DELETE_TITLE: "Delete thread",
  FEEDBACK_CONFIRM_DELETE: "Do you want to delete current feedback ({title})?",
  FEEDBACK_RESOLVED: "Resolved",
  FEEDBACK_SEND_TIP: "Please send feedback by Ctrl+Enter.",
  FEEDBACK_FINISH_THREAD: "Finish thread",
  FEEDBACK_FINISH_DESC: "Does your feedback is already resolved?",
};

/* ---------------------------------------------------------------- *
 * Certificate client errors
 * ---------------------------------------------------------------- */
const X509 = {
  X509_CERT_NOT_LOADED: "Cert not loaded.\nPlease load cert first.",
  X509_ERR_REPEAT_LOGIN: "Repeat login error.\nPlease retry after 3 seconds.",
  X509_ERR_AUTH_FAIL: "Auth Fail",
  X509_ERR_COMMUNICATION: "Communication error",
  X509_ERR_VERSION: "Please use latest version.",
};

/* ---------------------------------------------------------------- *
 * Domain code labels
 *
 * These describe integer codes the API returns. They were previously
 * exported as loose objects and read at module load by constants.js,
 * which baked English into those constants for the life of the page.
 * They are part of the catalogue now and read through getEnumText(),
 * so they follow the active locale like any other string.
 * ---------------------------------------------------------------- */
const ENUMS = {
  AGENCY_BUSINESS: {
    OS: "OS",
    REPAIR: "Repair",
    INSURANCE: "Insurance",
    CHANGE: "Change",
  },

  ESHOP_MONEY: {
    ACCUM: "Experience",
    WALLET: "Wallet",
    BONUS: "Bonus",
  },

  ESHOP_FILL: {
    PAY: "Pay",
    BONUS: "Bonus",
    BACK: "Back",
    REFUND: "Refund",
    COMBINE: "Combine",
    TRANSFER: "Transfer",
  },

  APPSTORE_PURCHASE: {
    DIAMOND: "Diamond",
    APPVERSION: "App",
    AVATAR: "Avatar",
    EVENTITEM: "Event Item",
    NICKNAME: "Nickname",
  },

  APPSTORE_PURCHASE_STATE: {
    PURCHASED: "Purchased",
    PURCHASING: "Purchasing",
  },

  APPSTORE_LICENSE_STATE: {
    SUCCESS: "Success",
    UNUSED: "Unused",
    USED: "Used",
    FAIL: "Fail",
    REFUND: "Refund",
    PENDING: "Pending",
    ACCEPT_PENDING: "Accept Pending",
  },

  APPSTORE_WALLET_MONEY: {
    IMMATERIAL: "Immaterial",
    COMPANY: "Company",
    NATIONAL: "National",
    FOREIGN: "Foreign",
    MATERIAL: "Material",
  },

  APPSTORE_TRANSACTION_LABEL: {
    ALL: "All",
    PURCHASE: "Purchase",
    CHARGE: "Charge",
    TRANSFER: "Transfer",
    RECEIVE: "Receive",
  },

  APPSTORE_TRANSACTION: {
    CHARGE: "Charge",
    RECEIPT: "Receipt(Agency)",
    TRANSFER: "Transfer",
    RECEIVE: "Receive",
    PURCHASE: "Purchase",
    SMARTPHONE: "Smartphone",
    BONUS_REWARD: "Bonus reward",
    BONUS_IN: "Bonus In",
    BASIC_TRANSFER: "Basic Transfer",
    BASIC_RECEIPT: "Basic Receipt",
    REFUND: "Refund",
    EXCHANGE: "Exchange",
    RECOVERY: "Recovery",
    RESTORE: "Restore",
  },

  SOFT_POINT_STATUS: {
    CHARGE: "Charge",
    MINUS: "Minus",
    REFUND: "Refund",
  },

  ACTIVITY_POINT_PREFIX: {
    ALL: "All",
    FIXED: "Fixed",
    MOBILE: "Mobile",
    BLOG: "Blog",
    ETC: "Etc",
  },

  FEEDBACK_CATEGORY: {
    PID: "Mobile",
    PHONE_SALE: "Phone Sale",
    PHONE_AS: "Phone AS",
    EPRODUCT: "Eproduct",
    EPROD_REG: "Eproduct Register",
    ESHOP: "Eshop",
    MARS: "Mars",
    APPSTORE: "Appstore",
    PHONE_REG: "Phone Register",
    BLOG: "Blog",
    FIXED: "Fixed",
    CONTACT: "Contact",
  },

  FEEDBACK_THREAD_STATUS: {
    DISCUSSING: "Discussing",
    RESOLVED: "Resolved",
    FINISHED: "Finished",
  },

  BLOG_OLD_CATEGORY: {
    DISCUSS: "Discuss",
    PRODUCT: "Products",
    PROD_PHONE: "Phone",
    PROD_TV: "TV, STB",
    PROD_COMPUTER: "Computer",
    PROD_ETC: "Etc",
    IT: "IT",
    SCIENCE: "Science",
    ECONOMY: "Economy, Trade",
    HELP: "Help",
  },

  BLOG_OLD_HELP_STATUS: {
    INPROGRESS: "Inprogress",
    RESOLVED: "Resolved",
    FINISHED: "Finished",
    CORRECT: "Correct Answer",
    VERIFYING: "Verifying",
  },

  BLOG_OLD_STATUS: {
    REQUEST: "Request",
    ADMIN_AGREE: "Accept",
    ADMIN_DENY: "Deny",
    PENDING: "Pending",
    PUB_AGREE: "Agree",
    PUB_DENY: "Deny",
    PUB_CANCEL: "Pub Cancel",
    PUB_PENDING: "Accept",
    COPIED_BLOG: "Copied",
    REQ_COPIED_BLOG: "Copied (Req)",
    ADMIN_DENYING: "Pending",
    TEMP: "Unknown",
  },

  EPROD_REGISTER_STATUS: {
    PENDING: "Pending",
    APPROVE: "Approved",
    DENY: "Denied",
    TRANSFER: "Transfered",
    DELETE: "Deleted",
    VERIFY: "Verified",
  },

  EPROD_FEEDBACK_STATE: {
    NONE: "Error report",
    PENDING: "Pending",
    ACCEPT: "Accepted",
    REJECT: "Rejected",
  },
};

/* ---------------------------------------------------------------- *
 * Transport status text
 * ---------------------------------------------------------------- */
const RESPONSES = {
  SUCCESS: "Success",
  BAD_REQUEST: "Bad Request",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not Found",
  CONFLICT: "Conflict",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
};

const en = {
  code: "en",
  name: "English",
  intlTag: "en-US",
  messages: Object.assign(
    {},
    EDITOR,
    CALENDAR,
    COMMON,
    PLURALS,
    FORMS,
    TABLE,
    CAROUSEL,
    MENU,
    CHROME,
    AUTH,
    HOME,
    STORE,
    ACCOUNT,
    X509
  ),
  enums: ENUMS,
  responses: RESPONSES,
};

export default en;
