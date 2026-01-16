# Secure SoundCloud Download Gate

Production-ready free download gate with SoundCloud OAuth follow verification and
soft-gated Instagram/TikTok visits. WAV downloads are delivered via short-lived
signed URLs from a private bucket.

## Architecture

- **Frontend:** Next.js App Router + React + Tailwind
- **Auth:** SoundCloud OAuth 2.0 (server-side verification)
- **State:** Session cookie + Supabase for hard-gated verification
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
- `NEXT_PUBLIC_INSTAGRAM_URL` (optional, set when ready)
- `NEXT_PUBLIC_TIKTOK_URL` (optional, set when ready)

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Gating logic

**Hard-gated**

- SoundCloud follow is verified via OAuth, then checked server-side against the
  artist SoundCloud ID.

**Soft-gated**

- Instagram/TikTok are outbound visits only (no API verification). Buttons open
  profiles, the user must return after ~6.5s to mark complete.

## Security guarantees

- WAV file can be served from a public link or a private bucket.
- Signed URLs are optional; public links are allowed for a simpler setup.
- No scraping or third-party API use for IG/TikTok.

## Notes

- On first load, the app creates a secure session cookie.
- OAuth callback posts a message back to the opener window and closes itself.
- Downloads are limited to one per session.

## Supabase table

Create a `sessions` table with:

- `id` text primary key
- `sc_user_id` text
- `sc_access_token` text
- `sc_verified` boolean default false
- `download_count` int default 0
- `created_at` timestamp default now()
- `updated_at` timestamp default now()
