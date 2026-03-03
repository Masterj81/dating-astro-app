const jwt = require('jsonwebtoken');
const fs = require('fs');

// UPDATE THESE VALUES:
const TEAM_ID = 'N3DUNTLR46';                  // Your 10-char Team ID
const KEY_ID = '2UK2M2FU6L';                   // Your Key ID from Apple
const SERVICES_ID = 'app.astrodating.signin';  // Your Services ID
const KEY_PATH = 'C:/SAT/cours/tab 10 p/AuthKey.p8';               // Path to your .p8 file

const privateKey = fs.readFileSync(KEY_PATH, 'utf8');

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  audience: 'https://appleid.apple.com',
  issuer: TEAM_ID,
  subject: SERVICES_ID,
  keyid: KEY_ID
});

console.log('\nYour Apple Client Secret:\n');
console.log(token);
