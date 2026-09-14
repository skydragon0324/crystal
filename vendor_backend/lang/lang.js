const { LANG_EN } = require('../lang/en');

const getLangText = (key, replacements) => {
  let collection = LANG_EN;

  if (!collection[key]) {
    return "";
  }

  if (replacements && replacements.length > 0) {
    return collection[key].replace(/%s/g, function() {
      return replacements.shift();
    });
  }
  return collection[key];
}

module.exports = {
  getLangText,
};
