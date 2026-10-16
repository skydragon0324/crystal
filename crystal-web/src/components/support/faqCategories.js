/**
 * WHAT A PUBLISHED ANSWER CAN BE FILED UNDER, and the words for each.
 *
 * The FAQ was filed by TOPIC once - warranty, repair, account, OS, order -
 * and the chips above it read `warranty`, `repair`, `os`, lower-cased straight
 * out of the database. Then by SYSTEM, which put every television, set-top
 * box, computer and camera question under one chip, "Eproducts", and left the
 * visitor holding a set-top box to read through the televisions.
 *
 * So the category is now the PRODUCT KIND in the visitor's hands - the same
 * five the catalogue sells - and then the three Crystal services that are not
 * products. The label is written here rather than derived from the code,
 * because STB is a code and "Secure Camera" is what the range is called.
 *
 * The ORDER is the reading order the API answers in (crystal-backend
 * src/utils/faqCategories.js); it is repeated here because this file also has
 * to label a category that arrives on its own, out of a list.
 */
export const FAQ_CATEGORIES = [
  { value: 'SMARTPHONE', label: 'Smartphones' },
  { value: 'TV', label: 'TV' },
  { value: 'STB', label: 'STB' },
  { value: 'COMPUTER', label: 'Computer' },
  { value: 'CAMERA', label: 'Secure Camera' },
  { value: 'CRYSTAL_APP', label: 'Crystal App' },
  { value: 'ESHOP', label: 'Eshop' },
  { value: 'APPSTORE', label: 'Appstore' }
];

/**
 * THE TWO FAMILIES THE EIGHT FALL INTO, as the chips above the FAQ read them.
 *
 * Five of the eight are product kinds, which is a lot of chips for a reader to
 * scan - so the first row is the family and the second row, drawn only once a
 * family is chosen, is the categories inside it. It is the shape the forum's
 * shelves already use.
 *
 * WHICH CATEGORY IS IN WHICH FAMILY IS NOT DECIDED HERE. The API answers
 * `group` on every category it counts (crystal-backend
 * src/utils/faqCategories.js), so this file holds only the words - the same
 * division of labour as the labels above, where "CAMERA" is the code and
 * "Secure Camera" is what the range is called.
 */
export const FAQ_GROUPS = [
  { value: 'PRODUCTS', label: 'support.faq.groupProducts' },
  { value: 'SERVICES', label: 'support.faq.groupServices' }
];

/** The address of the words for a family, or null for a category outside both. */
export function faqGroupLabel(code) {
  const found = FAQ_GROUPS.filter((entry) => entry.value === code)[0];
  return found ? found.label : null;
}

/**
 * The words for a category code.
 *
 * A code with no entry is TIDIED rather than dropped: a database restored from
 * before the categories were fixed still has questions in it, and showing them
 * under an odd-looking heading is better than hiding them.
 */
export function faqCategoryLabel(code) {
  const found = FAQ_CATEGORIES.filter((entry) => entry.value === code)[0];
  if (found) return found.label;

  const text = String(code || '').replace(/_/g, ' ').toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}
