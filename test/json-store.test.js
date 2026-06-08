const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JsonStore } = require('../lib/json-store');

test('json store saves users and messages to disk', () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rci-store-')), 'data.json');
  const store = new JsonStore(filePath);

  const user = store.upsertUser('Rahul', '9876543210');
  store.setUserApproval('9876543210', 1);
  const announcement = store.insertAnnouncement({
    category: 'Meetup',
    message: 'encrypted-message',
    meet_date: '2026-06-08',
    meet_time: '17:00',
    place: 'Library',
    admin_name: 'Admin'
  });
  const chat = store.insertChat(user.id, 'encrypted-chat');

  const reloaded = new JsonStore(filePath);
  assert.equal(reloaded.getApprovedUserByPhone('9876543210').name, 'Rahul');
  assert.equal(reloaded.listAnnouncements()[0].id, announcement.id);
  assert.equal(reloaded.listChatWithUsers()[0].id, chat.id);
});
