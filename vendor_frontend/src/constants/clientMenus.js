import { getLangText } from "lang/lang";

/**
 * The site's primary navigation.
 *
 * This is a function rather than an exported array because the labels are
 * translated. An array built at module load captures whatever language
 * happened to be active when the bundle first evaluated - which is before
 * the app has read the visitor's stored choice - and no later language
 * change can reach it. Called during render, it is always in the current
 * language.
 *
 * A group with a `category` becomes a dropdown in the header; a group
 * without one is a single top-level link.
 */
export const getClientMenus = () => [{
  category: { name: getLangText("MENU_HOME_PHONE"), path: "/vendor/phone" },
  menus: [
    { name: getLangText("MENU_PHONE_PRODUCT"), path: "/vendor/phone/products" },
    { name: getLangText("MENU_PHONE_AGENCY"), path: "/vendor/phone/agencies" },
    { name: getLangText("MENU_PHONE_FAQ"), path: "/vendor/phone/faqs" },
  ]
}, {
  menus: [
    { name: getLangText("MENU_HOME_EPROD"), path: "/eproduct", external: true },
  ]
}, {
  menus: [
    { name: getLangText("MENU_HOME_ESHOP"), path: "/eshop/www", external: true },
  ]
}, {
  menus: [
    { name: getLangText("MENU_HOME_APPSTORE"), path: "/appstore", external: true },
  ]
}, {
  menus: [
    { name: getLangText("MENU_HOME_BLOG"), path: "/vendor/blog" },
  ]
}, {
  menus: [
    { name: getLangText("MENU_HOME_INTRO"), path: "/vendor/intro" },
  ]
}];
