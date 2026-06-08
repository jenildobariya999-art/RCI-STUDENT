require('dotenv').config();

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';
const DATABASE_PATH = process.env.DATABASE_PATH || './data.sqlite';
const { encrypt, decrypt } = require('./lib/crypto-utils');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const db = new Database(DATABASE_PATH);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      approved INTEGER DEFAULT 0,
      otp_hash TEXT,
      otp_expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      meet_date TEXT,
      meet_time TEXT,
      place TEXT,
      admin_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS support_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      subscription TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
  `);
}

function sign(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  } catch {
    res.status(401).json({ error: 'Login required' });
  }
}

function requireUser(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'user') return res.status(403).json({ error: 'Member only' });
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND approved = 1').get(decoded.id);
    if (!user) return res.status(403).json({ error: 'Admin approval required' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Login required' });
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, approved: Boolean(user.approved) };
}

function publicAnnouncement(row) {
  return { ...row, message: decrypt(row.message) };
}

async function sendSms(phone, message) {
  if (!FAST2SMS_API_KEY) {
    console.log(`[SMS disabled] ${phone}: ${message}`);
    return { disabled: true };
  }
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: FAST2SMS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ route: 'q', message, language: 'english', flash: 0, numbers: phone })
  });
  if (!response.ok) throw new Error(`Fast2SMS failed: ${response.status}`);
  return response.json();
}

async function notifyApprovedMembers(title, body) {
  const users = db.prepare('SELECT phone FROM users WHERE approved = 1').all();
  await Promise.allSettled(users.map((user) => sendSms(user.phone, `${title}: ${body}`)));

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const payload = JSON.stringify({ title, body, url: '/' });
  const subscriptions = db.prepare('SELECT id, subscription FROM push_subscriptions').all();
  await Promise.allSettled(subscriptions.map(async (item) => {
    try {
      await webpush.sendNotification(JSON.parse(item.subscription), payload);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(item.id);
      }
    }
  }));
}

app.get('/api/config', (req, res) => {
  res.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

app.post('/api/admin/login', async (req, res) => {
  const ok = await bcrypt.compare(req.body.password || '', await bcrypt.hash(ADMIN_PASSWORD, 10));
  if (!ok) return res.status(401).json({ error: 'Wrong password' });
  res.json({ token: sign({ role: 'admin' }) });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, phone, approved, created_at FROM users ORDER BY created_at DESC').all().map(publicUser));
});

app.post('/api/admin/approve', requireAdmin, async (req, res) => {
  const { phone, approved = true } = req.body;
  const info = db.prepare('UPDATE users SET approved = ? WHERE phone = ?').run(approved ? 1 : 0, phone);
  if (!info.changes) return res.status(404).json({ error: 'Phone not found' });
  if (approved) await sendSms(phone, 'Your announcement app access is approved. You can now verify OTP and enter.');
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
  if (!name || phone.length !== 10) return res.status(400).json({ error: 'Name and valid 10 digit phone required' });
  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!existing) {
    db.prepare('INSERT INTO users (name, phone, approved, created_at) VALUES (?, ?, 0, ?)').run(name, phone, Date.now());
  } else {
    db.prepare('UPDATE users SET name = ? WHERE phone = ?').run(name, phone);
  }
  res.json({ ok: true, message: 'Registration sent. Admin must approve this number before OTP login.' });
});

app.post('/api/request-otp', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND approved = 1').get(phone);
  if (!user) return res.status(403).json({ error: 'Only admin-approved numbers can request OTP.' });
  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otp, 10);
  db.prepare('UPDATE users SET otp_hash = ?, otp_expires_at = ? WHERE id = ?').run(otpHash, Date.now() + 5 * 60 * 1000, user.id);
  await sendSms(phone, `Your OTP is ${otp}. It expires in 5 minutes.`);
  res.json({ ok: true, message: 'OTP sent' });
});

app.post('/api/verify-otp', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
  const otp = String(req.body.otp || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND approved = 1').get(phone);
  if (!user || !user.otp_hash || Date.now() > user.otp_expires_at) return res.status(401).json({ error: 'OTP expired or invalid' });
  const ok = await bcrypt.compare(otp, user.otp_hash);
  if (!ok) return res.status(401).json({ error: 'Wrong OTP' });
  db.prepare('UPDATE users SET otp_hash = NULL, otp_expires_at = NULL WHERE id = ?').run(user.id);
  res.json({ token: sign({ role: 'user', id: user.id }), user: publicUser(user) });
});

app.get('/api/announcements', requireUser, (req, res) => {
  res.json(db.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50').all().map(publicAnnouncement));
});

app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
  const category = ['ALL', 'Meetup'].includes(req.body.category) ? req.body.category : 'ALL';
  const message = String(req.body.message || '').trim();
  const adminName = String(req.body.adminName || '').trim() || 'Admin';
  if (!message) return res.status(400).json({ error: 'Message required' });
  const info = db.prepare(`
    INSERT INTO announcements (category, message, meet_date, meet_time, place, admin_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(category, encrypt(message), req.body.meetDate || '', req.body.meetTime || '', req.body.place || '', adminName, Date.now());
  const row = publicAnnouncement(db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid));
  io.emit('announcement', row);
  await notifyApprovedMembers(category, message);
  res.json(row);
});

app.post('/api/support', requireUser, (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message required' });
  const info = db.prepare('INSERT INTO support_requests (user_id, message, created_at) VALUES (?, ?, ?)').run(req.user.id, encrypt(message), Date.now());
  io.to('admins').emit('support', { id: info.lastInsertRowid, from: req.user.name, phone: req.user.phone, message, created_at: Date.now() });
  res.json({ ok: true });
});

app.get('/api/admin/support', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, u.name, u.phone, s.message, s.created_at
    FROM support_requests s JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC LIMIT 100
  `).all().map((row) => ({ ...row, message: decrypt(row.message) }));
  res.json(rows);
});

app.get('/api/chat', requireUser, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, u.name, c.message, c.created_at
    FROM chat_messages c JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC LIMIT 100
  `).all().reverse().map((row) => ({ ...row, message: decrypt(row.message) }));
  res.json(rows);
});

app.post('/api/chat', requireUser, (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message required' });
  const info = db.prepare('INSERT INTO chat_messages (user_id, message, created_at) VALUES (?, ?, ?)').run(req.user.id, encrypt(message), Date.now());
  const row = { id: info.lastInsertRowid, name: req.user.name, message, created_at: Date.now() };
  io.emit('chat', row);
  res.json(row);
});

app.post('/api/push-subscribe', requireUser, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO push_subscriptions (user_id, subscription, created_at) VALUES (?, ?, ?)')
    .run(req.user.id, JSON.stringify(req.body.subscription), Date.now());
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on('admin:join', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') socket.join('admins');
    } catch {}
  });
});

initDb();
if (require.main === module) {
  server.listen(PORT, () => console.log(`Announcement app running on http://localhost:${PORT}`));
}

module.exports = { app, encrypt, decrypt, initDb, db };

