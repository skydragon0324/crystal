/**
 * THE FIVE CRYSTAL SYSTEMS a published answer can belong to.
 *
 * The FAQ used to be filed by TOPIC - warranty, repair, account, OS, order -
 * and the chips above it read `warranty`, `repair`, `os`, lower-cased straight
 * out of the database. A real axis, but not the one a visitor arrives on:
 * somebody holding a set-top box that will not start looks for the product in
 * their hands, not for a subject heading, and "os" is a column name rather
 * than a word.
 *
 * So the category is the SYSTEM, in the same five words the feedback form
 * already offers - a question and an enquiry about the same thing should not
 * be filed under two different names - and the label is written here rather
 * than derived from the code.
 *
 * The ORDER is the reading order the API answers in; it is repeated here
 * because this file also has to label a category that arrives on its own, out
 * of a list.
 */
export const FAQ_SYSTEMS = [
  { value: 'SMARTPHONE', label: 'Smartphones' },
  { value: 'EPRODUCT', label: 'Eproducts' },
  { value: 'ESHOP', label: 'Eshop' },
  { value: 'APPSTORE', label: 'Appstore' },
  { value: 'CRYSTAL_APP', label: 'Crystal App' }
];

/**
 * The words for a category code.
 *
 * A code with no entry is TIDIED rather than dropped: a database restored from
 * before the categories were fixed still has questions in it, and showing them
 * under an odd-looking heading is better than hiding them.
 */
export function faqSystemLabel(code) {
  const found = FAQ_SYSTEMS.filter((entry) => entry.value === code)[0];
  if (found) return found.label;

  const text = String(code || '').replace(/_/g, ' ').toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}
