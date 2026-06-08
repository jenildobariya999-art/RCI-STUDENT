const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt } = require('../lib/crypto-utils');

test('encrypt stores unreadable text and decrypt restores it', () => {
  const message = 'Meet at library 5 PM';
  const secret = 'test-secret-key';
  const encrypted = encrypt(message, secret);
  assert.notEqual(encrypted, message);
  assert.equal(decrypt(encrypted, secret), message);
});
