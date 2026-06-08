const fs = require('fs');
const path = require('path');

const EMPTY_DATA = {
  users: [],
  announcements: [],
  support_requests: [],
  chat_messages: [],
  push_subscriptions: []
};

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return structuredClone(EMPTY_DATA);
      return { ...structuredClone(EMPTY_DATA), ...JSON.parse(fs.readFileSync(this.filePath, 'utf8')) };
    } catch (error) {
      console.error(`Could not read database file ${this.filePath}:`, error.message);
      return structuredClone(EMPTY_DATA);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  nextId(table) {
    return this.data[table].reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
  }

  listUsers() {
    return [...this.data.users].sort((a, b) => b.created_at - a.created_at);
  }

  getUserByPhone(phone) {
    return this.data.users.find((user) => user.phone === phone);
  }

  getApprovedUserByPhone(phone) {
    const user = this.getUserByPhone(phone);
    return user && user.approved ? user : null;
  }

  getApprovedUserById(id) {
    return this.data.users.find((user) => user.id === id && user.approved) || null;
  }

  upsertUser(name, phone) {
    const existing = this.getUserByPhone(phone);
    if (existing) {
      existing.name = name;
      this.save();
      return existing;
    }
    const user = { id: this.nextId('users'), name, phone, approved: 0, otp_hash: null, otp_expires_at: null, created_at: Date.now() };
    this.data.users.push(user);
    this.save();
    return user;
  }

  setUserApproval(phone, approved) {
    const user = this.getUserByPhone(phone);
    if (!user) return false;
    user.approved = approved ? 1 : 0;
    this.save();
    return true;
  }

  setUserOtp(id, otpHash, otpExpiresAt) {
    const user = this.data.users.find((item) => item.id === id);
    if (!user) return false;
    user.otp_hash = otpHash;
    user.otp_expires_at = otpExpiresAt;
    this.save();
    return true;
  }

  clearUserOtp(id) {
    return this.setUserOtp(id, null, null);
  }

  listApprovedPhones() {
    return this.data.users.filter((user) => user.approved).map((user) => ({ phone: user.phone }));
  }

  insertAnnouncement(announcement) {
    const row = { id: this.nextId('announcements'), ...announcement, created_at: Date.now() };
    this.data.announcements.push(row);
    this.save();
    return row;
  }

  listAnnouncements(limit = 50) {
    return [...this.data.announcements].sort((a, b) => b.created_at - a.created_at).slice(0, limit);
  }

  insertSupport(userId, message) {
    const row = { id: this.nextId('support_requests'), user_id: userId, message, created_at: Date.now() };
    this.data.support_requests.push(row);
    this.save();
    return row;
  }

  listSupportWithUsers(limit = 100) {
    return [...this.data.support_requests]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map((support) => {
        const user = this.data.users.find((item) => item.id === support.user_id) || {};
        return { id: support.id, name: user.name || 'Unknown', phone: user.phone || '', message: support.message, created_at: support.created_at };
      });
  }

  insertChat(userId, message) {
    const row = { id: this.nextId('chat_messages'), user_id: userId, message, created_at: Date.now() };
    this.data.chat_messages.push(row);
    this.save();
    return row;
  }

  listChatWithUsers(limit = 100) {
    return [...this.data.chat_messages]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .reverse()
      .map((chat) => {
        const user = this.data.users.find((item) => item.id === chat.user_id) || {};
        return { id: chat.id, name: user.name || 'Unknown', message: chat.message, created_at: chat.created_at };
      });
  }

  insertPushSubscription(userId, subscription) {
    const serialized = JSON.stringify(subscription);
    if (this.data.push_subscriptions.some((item) => item.subscription === serialized)) return null;
    const row = { id: this.nextId('push_subscriptions'), user_id: userId, subscription: serialized, created_at: Date.now() };
    this.data.push_subscriptions.push(row);
    this.save();
    return row;
  }

  listPushSubscriptions() {
    return [...this.data.push_subscriptions];
  }

  deletePushSubscription(id) {
    const before = this.data.push_subscriptions.length;
    this.data.push_subscriptions = this.data.push_subscriptions.filter((item) => item.id !== id);
    if (before !== this.data.push_subscriptions.length) this.save();
  }
}

module.exports = { JsonStore };
