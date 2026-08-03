# SoundCloud Download Gate — Setup

The download gate is SoundCloud-only. When a fan clicks **Follow + Like to
unlock**, the site opens SoundCloud OAuth, and on return it calls the SoundCloud
API on their behalf to:

1. `PUT /me/followings/{artist_id}` — follow the artist
2. `POST /likes/tracks/{track_id}` — like the track they're downloading

Only then does the Download button unlock.

## Heads up: SoundCloud paused gate integrations in June 2026

In early June 2026 SoundCloud paused the API integrations behind every major
download-gate service — Hypeddit, GateRush and the rest. Hypeddit's SoundCloud
step is now voluntary rather than enforced, and there has been no public
statement from SoundCloud about when (or whether) automated follow/like comes
back. The endpoints themselves still exist.

Because of that, this gate ships with an automatic fallback:

- If the OAuth env vars are missing, or SoundCloud answers a write call with
  `403`/`404`, the UI switches to **manual mode** — "open SoundCloud in a new
  tab, follow + like, come back" on the honour system.
- Downloads therefore never break, whatever SoundCloud does to the API.

You'll know which mode you're in by looking at the gate: auto mode shows two
live checkmarks ("Following YVSH", "Liked this track"); manual mode shows a
single "Follow + like on SoundCloud" button.

## 1. Register a SoundCloud API app

Requires an **Artist Pro** subscription on the SoundCloud account — SoundCloud
reopened self-serve API keys in May 2026, but only for Artist Pro.

1. Go to https://developers.soundcloud.com/docs/api/register-app
2. Register the app with redirect URI
   `https://<your-domain>/api/soundcloud/callback`
   (add `http://localhost:3000/api/soundcloud/callback` too for local dev — the
   redirect URI must match *exactly*)
3. Copy the Client ID and Client Secret

## 2. Environment variables

```bash
SOUNDCLOUD_CLIENT_ID=...
SOUNDCLOUD_CLIENT_SECRET=...
SOUNDCLOUD_REDIRECT_URI=https://<your-domain>/api/soundcloud/callback
SOUNDCLOUD_ARTIST_ID=...        # optional — resolved from the profile URL if unset
NEXT_PUBLIC_SOUNDCLOUD_URL=https://soundcloud.com/yvshh
NEXT_PUBLIC_ARTIST_NAME=YVSH
```

Leaving `SOUNDCLOUD_CLIENT_ID`/`SECRET` unset is a valid state — the gate just
runs in manual mode.

## 3. Database migration

The gate stores tokens and per-track follow/like results on the existing
`sessions` table. Run this in the Supabase SQL editor:

```sql
alter table sessions
  add column if not exists sc_username text,
  add column if not exists sc_refresh_token text,
  add column if not exists sc_expires_at timestamptz,
  add column if not exists sc_engagement jsonb not null default '{}'::jsonb;
```

If you skip it the gate still works for the length of a visit — it just logs a
warning and can't remember the follow/like across page loads.

## 4. Track configuration

Nothing extra per track. `src/lib/tracks.ts` derives each track's SoundCloud
permalink from its embed URL, and the gate resolves that to an API track id via
`/resolve`. Two optional overrides exist on `TrackConfig`:

- `soundcloudUrl` — set when the permalink isn't in the embed URL
- `soundcloudTrackId` — set to skip the `/resolve` round trip

## How it fits together

| File | Role |
| --- | --- |
| `src/lib/soundcloud.ts` | OAuth 2.1 + PKCE, follow/like/resolve API calls |
| `src/lib/soundcloudGate.ts` | Token refresh, runs follow + like, gate status |
| `src/app/api/soundcloud/login` | Starts OAuth (popup) |
| `src/app/api/soundcloud/callback` | Exchanges code, then follows + likes |
| `src/app/api/soundcloud/status` | Current gate state for a track |
| `src/app/api/soundcloud/engage` | Retry follow + like without reconnecting |
| `src/components/DownloadGate.tsx` | The UI, incl. manual fallback |

## Terms-of-use note

SoundCloud's API terms allow acting on a user's behalf only when the action is
"specifically and deliberately initiated by the user via an authenticated use of
your app". That's why the button is labelled with exactly what it will do and
the consent line sits directly under it — don't reword those to hide the
follow/like.
