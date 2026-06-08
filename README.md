# Private Announcement Board

A small website for a CA student group where only the admin can post announcements and only admin-approved phone numbers can enter with OTP verification.

## What this app includes

- **Admin login:** the admin uses one secret password from `.env`.
- **Register page:** friends enter name and mobile number.
- **Admin approval:** OTP login works only after the admin approves that mobile number.
- **OTP verification:** approved members receive OTP through Fast2SMS.
- **Buttons / sections:** `ALL`, `Meetup`, `Raise Hand For Support`, and `Chat`.
- **Notifications:** new announcements are sent by SMS and browser push notification when VAPID keys are configured.
- **Encrypted storage:** announcements, support requests, and chat messages are encrypted in the data file with AES-256-GCM.
- **Encrypted storage:** announcements, support requests, and chat messages are encrypted in SQLite with AES-256-GCM.
- **Simple group chat:** all approved members can chat together.
- **Vercel-compatible API:** includes `api/index.js` and `vercel.json` so `/api/*` requests run as a Vercel serverless function.
- **Private support:** “Raise Hand For Support” messages are visible only in the admin panel.

## Announcement type suggestions

You asked for 2-3 options like a notice board. These are the best simple options:

1. **Notice Board / ALL** — for any message you want to send to everyone.
2. **Meetup** — for date, time, place, and your name when friends should meet.
3. **Raise Hand For Support** — friend sends a private help message that only admin receives.

The website also has **Chat** for approved members.

## File names

| File | Purpose |
| --- | --- |
| `server.js` | Backend API, admin login, approval, OTP, encryption, notifications, chat, support. |
| `lib/json-store.js` | Lightweight JSON data store used instead of native SQLite so Vercel can deploy without native module crashes. |
| `api/index.js` | Vercel serverless entry point that exports the Express app. |
| `vercel.json` | Vercel routing so frontend files and `/api/*` endpoints work correctly. |
| `public/index.html` | Website layout, register page, OTP form, admin panel, and the four buttons. |
| `public/app.js` | Frontend logic for forms, tabs, API calls, polling refresh, and push subscription. |
| `public/styles.css` | Website design. |
| `public/sw.js` | Browser push notification service worker. |
| `.env.example` | Example environment variables for GitHub/deployment secrets. |
| `package.json` | Node dependencies and start/test commands. |
| `test/encryption.test.js` | Encryption unit test. |

## Setup on GitHub / local computer

1. Upload these files to your GitHub repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy environment example:

   ```bash
   cp .env.example .env
   ```

4. Edit `.env`:

   ```env
   ADMIN_PASSWORD=your-secret-admin-password
   JWT_SECRET=make-this-long-and-random
   APP_ENCRYPTION_KEY=make-this-long-and-random-too
   FAST2SMS_API_KEY=your-fast2sms-api-key
   ```

5. Generate browser push keys if you want push notifications:

   ```bash
   npx web-push generate-vapid-keys
   ```

   Put the generated values into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `.env`.

6. Start the website:

   ```bash
   npm start
   ```

7. Open:

   ```text
   http://localhost:3000
   ```

## How the flow works

1. Friend registers with name and mobile number.
2. Admin logs in with the secret password.
3. Admin approves the friend’s phone number in the admin panel.
4. Friend requests OTP.
5. Fast2SMS sends OTP.
6. Friend verifies OTP and can access `ALL`, `Meetup`, `Raise Hand For Support`, and `Chat`.
7. Admin posts an announcement and all approved members get SMS plus push notification if enabled.

## Vercel deployment note

### Fix for `Expected ',' or '}' after property value in JSON`

If Vercel shows `vercel/path0/package.json: Expected ',' or '}' after property value in JSON`, it means the deployed `package.json` text is not valid JSON. Common causes are a missing comma after a property, comments inside JSON, or editing the file in GitHub without keeping quotes/commas. This repo now includes `npm run check:json`, and Vercel runs it through `vercel-build` before tests so JSON mistakes fail with a clearer message.

Before pushing to GitHub, run:

```bash
npm run check:json
```


The screenshot error `500: FUNCTION_INVOCATION_FAILED` means Vercel reached your project, but the backend serverless function crashed. This repo now includes `api/index.js` and `vercel.json` so Vercel knows how to run the Express API instead of trying to run the normal local server command.

For Vercel, add these environment variables in **Vercel Dashboard → Project → Settings → Environment Variables**:

```env
ADMIN_PASSWORD=your-secret-admin-password
JWT_SECRET=make-this-long-and-random
APP_ENCRYPTION_KEY=make-this-long-and-random-too
FAST2SMS_API_KEY=your-fast2sms-api-key
VAPID_PUBLIC_KEY=optional-browser-push-public-key
VAPID_PRIVATE_KEY=optional-browser-push-private-key
VAPID_SUBJECT=mailto:you@example.com
```

Do not set `DATABASE_PATH` on Vercel unless you know the path is writable. By default, Vercel uses `/tmp/rci-student.json` because only `/tmp` is writable in serverless functions. Important: `/tmp` is not permanent storage, so approvals/chats can reset after a cold start. For permanent data, keep GitHub for source code and deploy the app to Render, Railway, Fly.io, or a VPS with a real database.
Do not set `DATABASE_PATH` on Vercel unless you know the path is writable. By default, Vercel uses `/tmp/rci-student.sqlite` because only `/tmp` is writable in serverless functions. Important: `/tmp` is not permanent storage, so approvals/chats can reset after a cold start. For permanent data, keep GitHub for source code and deploy the app to Render, Railway, Fly.io, or a VPS with a real database.

GitHub Pages cannot run this backend because OTP, encryption, approval, and chat need a Node server.
