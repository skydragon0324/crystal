import { getLangText } from "lang/lang";

/**
 * The account area's navigation.
 *
 * A function rather than an exported array, for the reason set out in
 * clientMenus.js: labels captured at module load are pinned to whichever
 * language the bundle first evaluated in and no later switch reaches them.
 */
export const getAccountMenus = () => [{
  category: { name: getLangText("MENU_ACCOUNT_ESHOP"), path: "/vendor/account/eshop" },
  menus: [
    { name: getLangText("MENU_ESHOP_CARD"), path: "/vendor/account/eshop/cards" },
    { name: getLangText("MENU_ESHOP_ORDER"), path: "/vendor/account/eshop/orders" },
    { name: getLangText("MENU_ESHOP_TRANSACTION"), path: "/vendor/account/eshop/transactions" },
    { name: getLangText("MENU_ESHOP_EXP_LOG"), path: "/vendor/account/eshop/exp_log" },
    { name: getLangText("MENU_ESHOP_COMMERCE_VALUE"), path: "/vendor/account/eshop/commerce_values" },
  ]
}, {
  category: { name: getLangText("MENU_ACCOUNT_APPSTORE"), path: "/vendor/account/appstore" },
  menus: [
    { name: getLangText("MENU_APPSTORE_PURCHASE"), path: "/vendor/account/appstore/purchase_log" },
    { name: getLangText("MENU_APPSTORE_COMMENT"), path: "/vendor/account/appstore/comments" },
    { name: getLangText("MENU_APPSTORE_FAVORITE"), path: "/vendor/account/appstore/favorites" },
  ]
}, {
  category: { name: getLangText("MENU_ACOCUNT_EPROD"), path: "/vendor/account/eprod" },
  menus: [
    { name: getLangText("MENU_EPROD_REGISTER"), path: "/vendor/account/eprod/register_log" },
    { name: getLangText("MENU_EPROD_KARAOKE"), path: "/vendor/account/eprod/karaoke_keygen_log" },
    { name: getLangText("MENU_EPROD_MB_KEYGEN"), path: "/vendor/account/eprod/manbang_keygen_log" },
    { name: getLangText("MENU_EPROD_BMEDIA"), path: "/vendor/account/eprod/bmedia_keygen_log" },
  ]
}, {
  category: { name: getLangText("MENU_ACOCUNT_POINT"), path: "/vendor/account/wallet" },
  menus: [
    { name: getLangText("MENU_POINT_CHARGE"), path: "/vendor/account/wallet/wallet_charge" },
    { name: getLangText("MENU_POINT_TRANSFER"), path: "/vendor/account/wallet/wallet_transfer" },
  ]
}, {
  category: { name: getLangText("MENU_ACOCUNT_SOFTWARE"), path: "/vendor/account/soft" },
  menus: [
    { name: getLangText("MENU_SOFT_APPSTORE"), path: "/vendor/account/soft/appstore_point_log" },
    { name: getLangText("MENU_SOFT_KARAOKE"), path: "/vendor/account/soft/karaoke_point_log" },
    { name: getLangText("MENU_SOFT_MEDIA"), path: "/vendor/account/soft/bmedia_point_log" },
    { name: getLangText("MENU_SOFT_MINUS"), path: "/vendor/account/soft/minus_point_log" },
    { name: getLangText("MENU_SOFT_KARA_OLD"), path: "/vendor/account/soft/karaoke_old_log" },
    { name: getLangText("MENU_SOFT_MEDIA_OLD"), path: "/vendor/account/soft/bmedia_old_log" },
  ]
}, {
  category: { name: getLangText("MENU_ACOCUNT_ACTIVITY"), path: "/vendor/account/activity" },
  menus: [
    { name: getLangText("MENU_ACTIVITY_POINT_LOG"), path: "/vendor/account/activity/activity_point_log" },
    { name: getLangText("MENU_ACTIVITY_OLD_LOG"), path: "/vendor/account/activity/activity_old_log" },
  ]
}, {
  category: { name: getLangText("MENU_ACOCUNT_BLOG"), path: "/vendor/account/blog" },
  menus: [
    { name: getLangText("MENU_BLOG_MINE"), path: "/vendor/account/blog/my_articles" },
    { name: getLangText("MENU_BLOG_DRAFT"), path: "/vendor/account/blog/my_drafts" },
  ]
}, {
  menus: [
    { name: getLangText("MENU_ACOCUNT_FEEDBACK"), path: "/vendor/account/message/feedback_threads" },
  ]
}];

