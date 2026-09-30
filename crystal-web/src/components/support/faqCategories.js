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
