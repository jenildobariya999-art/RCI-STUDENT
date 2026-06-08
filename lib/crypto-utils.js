const crypto = require('crypto');

function encryptionKey(secret) {
  return crypto.createHash('sha256').update(secret || 'dev-encryption-key-change-me').digest();
}

function encrypt(text, secret = process.env.APP_ENCRYPTION_KEY) {
  const key = encryptionKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(payload, secret = process.env.APP_ENCRYPTION_KEY) {
  if (!payload || !payload.includes(':')) return payload;
  const key = encryptionKey(secret);
  const [ivB64, tagB64, encryptedB64] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, encryptionKey };
