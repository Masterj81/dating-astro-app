const fs = require('fs');
const en = JSON.parse(fs.readFileSync('web/messages/en.json', 'utf8'));
const fr = JSON.parse(fs.readFileSync('web/messages/fr.json', 'utf8'));

function getKeys(obj, prefix) {
  prefix = prefix || '';
  let keys = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? prefix + '.' + k : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(getKeys(obj[k], path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const enKeys = getKeys(en).sort();
const frKeys = getKeys(fr).sort();
const missingInFr = enKeys.filter(function(k) { return frKeys.indexOf(k) === -1; });
const extraInFr = frKeys.filter(function(k) { return enKeys.indexOf(k) === -1; });

console.log('EN keys:', enKeys.length);
console.log('FR keys:', frKeys.length);
if (missingInFr.length) console.log('Missing in FR:', missingInFr);
if (extraInFr.length) console.log('Extra in FR:', extraInFr);
if (missingInFr.length === 0 && extraInFr.length === 0) console.log('All keys match perfectly!');
