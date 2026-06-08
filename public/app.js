const socket = io();
let userToken = localStorage.getItem('userToken') || '';
let adminToken = localStorage.getItem('adminToken') || '';

const $ = (selector) => document.querySelector(selector);
const authMessage = $('#auth-message');

function showMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? '#b42318' : '#0f8a4b';
}

async function api(path, options = {}, token = userToken) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function noticeHtml(item) {
  const meetup = [item.meet_date, item.meet_time, item.place].filter(Boolean).join(' • ');
  return `<article class="notice">
    <strong>${item.category}</strong>
    <p>${escapeHtml(item.message)}</p>
    ${meetup ? `<p class="meta">Meet: ${escapeHtml(meetup)}</p>` : ''}
    <p class="meta">By ${escapeHtml(item.admin_name)} • ${formatDate(item.created_at)}</p>
  </article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function loadAnnouncements() {
  if (!userToken) return;
  const announcements = await api('/api/announcements');
  $('#tab-all').innerHTML = `<h2>ALL</h2>${announcements.map(noticeHtml).join('') || '<p>No announcement yet.</p>'}`;
  const meetups = announcements.filter((item) => item.category === 'Meetup');
  $('#tab-meetup').innerHTML = `<h2>Meetup</h2>${meetups.map(noticeHtml).join('') || '<p>No meetup yet.</p>'}`;
}

async function loadChat() {
  if (!userToken) return;
  const messages = await api('/api/chat');
  $('#chat-list').innerHTML = messages.map((msg) => `<div class="chat-message"><strong>${escapeHtml(msg.name)}</strong><p>${escapeHtml(msg.message)}</p><span class="meta">${formatDate(msg.created_at)}</span></div>`).join('');
  $('#chat-list').scrollTop = $('#chat-list').scrollHeight;
}

async function loadAdmin() {
  if (!adminToken) return;
  socket.emit('admin:join', adminToken);
  const [users, support] = await Promise.all([
    api('/api/admin/users', {}, adminToken),
    api('/api/admin/support', {}, adminToken)
  ]);
  $('#user-list').innerHTML = users.map((user) => `<div class="user-row"><strong>${escapeHtml(user.name)}</strong><br>${user.phone}<br><span class="meta">${user.approved ? 'Approved' : 'Waiting'}</span></div>`).join('');
  $('#support-list').innerHTML = support.map((item) => `<div class="support-row"><strong>${escapeHtml(item.name)} (${item.phone})</strong><p>${escapeHtml(item.message)}</p><span class="meta">${formatDate(item.created_at)}</span></div>`).join('') || '<p>No support messages.</p>';
}

async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !userToken) return;
  const config = await api('/api/config', {}, '');
  if (!config.vapidPublicKey) return;
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
  });
  await api('/api/push-subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

$('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }, '');
    showMessage(data.message);
  } catch (error) { showMessage(error.message, true); }
});

$('#otp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitter = event.submitter.value;
  const form = Object.fromEntries(new FormData(event.currentTarget));
  try {
    if (submitter === 'request') {
      await api('/api/request-otp', { method: 'POST', body: JSON.stringify({ phone: form.phone }) }, '');
      showMessage('OTP sent by Fast2SMS.');
    } else {
      const data = await api('/api/verify-otp', { method: 'POST', body: JSON.stringify(form) }, '');
      userToken = data.token;
      localStorage.setItem('userToken', userToken);
      $('#member-area').classList.remove('hidden');
      await Promise.all([loadAnnouncements(), loadChat(), enablePushNotifications()]);
      showMessage(`Welcome ${data.user.name}`);
    }
  } catch (error) { showMessage(error.message, true); }
});

$('#admin-login').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }, '');
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    $('#admin-area').classList.remove('hidden');
    await loadAdmin();
    showMessage('Admin panel opened.');
  } catch (error) { showMessage(error.message, true); }
});

document.querySelectorAll('nav button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach((tab) => tab.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  button.classList.add('active');
  $(`#tab-${button.dataset.tab}`).classList.remove('hidden');
}));

$('#announcement-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/announcements', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }, adminToken);
    event.currentTarget.reset();
    showMessage('Announcement sent with SMS and push notification.');
  } catch (error) { showMessage(error.message, true); }
});

$('#approve-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  form.approved = event.submitter.value === 'true';
  try {
    await api('/api/admin/approve', { method: 'POST', body: JSON.stringify(form) }, adminToken);
    await loadAdmin();
    showMessage(form.approved ? 'Number approved.' : 'Number blocked.');
  } catch (error) { showMessage(error.message, true); }
});

$('#support-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/support', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    event.currentTarget.reset();
    showMessage('Support request sent only to admin.');
  } catch (error) { showMessage(error.message, true); }
});

$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/chat', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    event.currentTarget.reset();
  } catch (error) { showMessage(error.message, true); }
});

socket.on('announcement', loadAnnouncements);
socket.on('chat', loadChat);
socket.on('support', loadAdmin);

if (userToken) {
  $('#member-area').classList.remove('hidden');
  Promise.allSettled([loadAnnouncements(), loadChat(), enablePushNotifications()]);
}
if (adminToken) {
  $('#admin-area').classList.remove('hidden');
  loadAdmin().catch(() => localStorage.removeItem('adminToken'));
}
