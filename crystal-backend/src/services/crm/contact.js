/**
 * WHAT MAKES TWO CONTACT VALUES THE SAME, written once.
 *
 * crm_contact_point keeps the value as it was typed AND a normalised copy,
 * and every lookup - finding the customer at a counter, spotting a duplicate
 * party, choosing where a campaign message goes - compares the normalised
 * one. If the console normalised one way and the importer another, the same
 * phone number would be two contacts and the duplicate scan would never see
 * them. So both call this.
 */

/** Digits only, keeping a leading +: "+86 138-0013 8000" -> "+8613800138000". */
function phone(value) {
  const text = String(value || '').trim();
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return '';
  return (text.charAt(0) === '+' ? '+' : '') + digits;
}

function email(value) {
  return String(value || '').trim().toLowerCase();
}

/** The normalised form for a contact type; anything unlisted is trimmed only. */
function normalise(type, value) {
  switch (type) {
    case 'MOBILE':
    case 'PHONE':
    case 'SIM_CID':
      return phone(value);
    case 'EMAIL':
      return email(value);
    default:
      return String(value || '').trim();
  }
}

/**
 * A search term as the kinds of contact it could be.
 *
 * "13800138000" might be a mobile; "ada@" is an email fragment. The customer
 * search matches the term against the normalised column in the shape it would
 * have if it WERE that kind of contact, so a number typed with spaces still
 * finds the customer.
 */
function searchForms(term) {
  const forms = [];
  const digits = phone(term);
  if (digits.replace('+', '').length >= 4) forms.push(digits.replace('+', ''));
  const mail = email(term);
  if (mail.indexOf('@') !== -1 || /[a-z]/.test(mail)) forms.push(mail);
  return forms;
}

/** "+8613800138000" -> "+86******8000", for lists that show a contact without exposing it. */
function mask(value) {
  const text = String(value || '');
  if (text.length <= 6) return text;
  return text.slice(0, 3) + '*'.repeat(Math.max(3, text.length - 7)) + text.slice(-4);
}

module.exports = {
  phone: phone,
  email: email,
  normalise: normalise,
  searchForms: searchForms,
  mask: mask
};
