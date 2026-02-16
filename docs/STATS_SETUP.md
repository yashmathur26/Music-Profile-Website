# YVSH Stats — Setup

The **My YVSH Stats** feature lets fans connect Spotify and see personalized listening stats (fan level, most played song, peak hour, streaks, top tracks, listening personality). It uses the **same Spotify app** as the presave flow but a **different redirect URI** and **Supabase** for session storage.

## Environment variables

Reuse your existing Spotify and Supabase env from presave. Optional:

```bash
# Optional: artist name to filter stats (default: YVSH)
YVSH_ARTIST_NAME=YVSH

# Optional: when you have a Spotify artist ID, can be used for stricter matching
# YVSH_ARTIST_ID=...
```

`NEXT_PUBLIC_APP_URL` is used for the stats OAuth redirect (e.g. `https://yvshmusic.com` or `http://localhost:3000`).

## Spotify app: add redirect URI

In your [Spotify Dashboard](https://developer.spotify.com/dashboard) app (the same one used for presave):

1. Open your app → **Settings**.
2. Under **Redirect URIs**, add:
   - **Production:** `https://yvshmusic.com/api/auth/spotify/callback`
   - **Local:** `http://localhost:3000/api/auth/spotify/callback`
3. Save.

Presave uses `/api/spotify/callback`; stats use `/api/auth/spotify/callback`, so both can share one app.

## Supabase: `stats_sessions` table

Create a table to store stats OAuth sessions (session id in cookie, tokens in DB).

**Table name:** `stats_sessions`

| Column           | Type      | Notes                          |
|------------------|-----------|--------------------------------|
| `id`             | `text`    | Primary key (e.g. nanoid 32)   |
| `spotify_user_id`| `text`    | Spotify user ID                |
| `access_token`   | `text`    | Spotify access token           |
| `refresh_token`  | `text`    | Spotify refresh token          |
| `expires_at`     | `timestamptz` | Token expiry                |
| `created_at`     | `timestamptz` | Row creation (default now()) |

**SQL (Supabase SQL Editor):**

```sql
create table if not exists stats_sessions (
  id text primary key,
  spotify_user_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Optional: index for cleanup by spotify_user_id or created_at
create index if not exists idx_stats_sessions_spotify_user_id on stats_sessions(spotify_user_id);
create index if not exists idx_stats_sessions_created_at on stats_sessions(created_at);
```

**RLS:** Enable RLS on `stats_sessions`. Use a policy that allows **no one** by default; only your backend (using the **service role** key) should read/write. The frontend never talks to this table directly.

## Flow summary

1. User goes to `/stats` → clicks **Connect with Spotify** → `/api/auth/spotify` redirects to Spotify (scopes: `user-read-recently-played`, `user-top-read`, `user-read-private`).
2. Spotify redirects to `/api/auth/spotify/callback` with a code; backend exchanges it for tokens, creates a row in `stats_sessions`, sets HTTP-only cookie `yvsh_stats_session` with the session id, redirects to `/stats`.
3. `/stats` page calls **GET `/api/stats/spotify`**; API reads cookie, loads session, refreshes token if needed, fetches recently played + top tracks from Spotify, runs `calculateYvshStats`, returns JSON.
4. Dashboard shows fan level, most played song, peak hour, streaks, top YVSH tracks, listening personality, or “No YVSH listening data yet” when there’s no YVSH in their data.

## Security

- Session id only in HTTP-only cookie; tokens stay in Supabase.
- Same practices as presave: secrets in env, RLS, no client-side DB access, HTTPS.
