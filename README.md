# Secure SoundCloud Download Gate

Free download gate, SoundCloud only. Fans connect their SoundCloud account and
the site follows the artist and likes the track on their behalf via the
SoundCloud API, then unlocks the download.

Full setup (API app registration, env vars, SQL migration, fallback behaviour):
**[docs/SOUNDCLOUD_GATE_SETUP.md](docs/SOUNDCLOUD_GATE_SETUP.md)**.

## Architecture

- **Frontend:** Next.js App Router + React + Tailwind
- **Auth:** SoundCloud OAuth 2.1 + PKCE (server-side)
- **Actions:** `PUT /me/followings/:id` and `POST /likes/tracks/:id`
- **State:** Session cookie + Supabase `sessions` table
- **Storage:** Public link or S3/R2 private bucket + signed URLs (optional)

## Environment variables

Set these in your `.env.local`:

- `SOUNDCLOUD_CLIENT_ID`
- `SOUNDCLOUD_CLIENT_SECRET`
- `SOUNDCLOUD_REDIRECT_URI` (must match SoundCloud app config)
- `SOUNDCLOUD_ARTIST_ID` (artist user ID to verify follow)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `S3_ENDPOINT` (optional for R2)
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_OBJECT_KEY` (private WAV object key)
- `S3_FORCE_PATH_STYLE` (optional, `true` for some S3-compatible providers)
- `DOWNLOAD_FILENAME` (optional, defaults to `track.wav`)
- `NEXT_PUBLIC_ARTIST_NAME` (optional, defaults to `YVSH`)
- `NEXT_PUBLIC_SOUNDCLOUD_URL` (optional, defaults to `https://soundcloud.com/yvshh`)

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Gating logic

SoundCloud is the only step. Instagram and TikTok were removed from the gate.

**Auto mode** (SoundCloud OAuth env vars set)

- Fan clicks "Follow + Like to unlock" → OAuth popup → the server follows the
  artist and likes the track, then unlocks the download. All server-side.

**Manual fallback** (env vars unset, or SoundCloud rejects the write calls)

- Single outbound button to the track on SoundCloud, honour system, unlocks
  after the fan returns. Downloads never break because of API changes.

## Security guarantees

- WAV file can be served from a public link or a private bucket.
- Signed URLs are optional; public links are allowed for a simpler setup.
- OAuth uses PKCE + a CSRF `state` cookie; tokens stay server-side.

## Notes

- On first load, the app creates a secure session cookie.
- OAuth callback posts a message back to the opener window and closes itself.
- Downloads are limited to one per session.

## Supabase table

Create a `sessions` table with:

- `id` text primary key
- `sc_user_id` text
- `sc_username` text
- `sc_access_token` text
- `sc_refresh_token` text
- `sc_expires_at` timestamptz
- `sc_verified` boolean default false
- `sc_engagement` jsonb default `'{}'::jsonb` (per-track follow/like results)
- `download_count` int default 0
- `created_at` timestamp default now()
- `updated_at` timestamp default now()

Migration SQL for an existing table is in
[docs/SOUNDCLOUD_GATE_SETUP.md](docs/SOUNDCLOUD_GATE_SETUP.md).
