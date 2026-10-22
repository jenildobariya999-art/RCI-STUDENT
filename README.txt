# Vercel + Turso starter

Files:
- `server.js`: minimal Express API. It uses Turso through `@libsql/client`, not `better-sqlite3`.
- `package.json`: dependencies.
- `schema.sql`: optional SQL schema; the app creates the table automatically too.

## Vercel environment variables
Add these in Project → Settings → Environment Variables:
- `TURSO_DATABASE_URL` = your Turso database URL (`libsql://...`)
- `TURSO_AUTH_TOKEN` = your Turso auth token

Redeploy after saving them.

## Important Vercel note
This starter exports an Express app for Vercel's Express support. Deploy the files at the project root. If your Vercel project uses a different framework/build setup, its routing configuration may need adapting.

## API examples
- `GET /health` — checks database connection.
- `GET /api/data/example` — reads a key.
- `PUT /api/data/example` with JSON `{"value":{"hello":"world"}}` — saves a JSON value.
- `DELETE /api/data/example` — deletes a key.

This is a generic starter, not a conversion of your original website. It will not automatically reproduce unknown routes or migrate a previous local SQLite database. Do not store passwords, tokens, or private secrets in `app_data` unless you add appropriate authentication and access controls.
