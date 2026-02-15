# Spotify Presave — Setup

## Environment variables (Vercel / `.env.local`)

```bash
# Spotify (create app at https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret

# Supabase (existing or new project)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Release-day trigger (call POST /api/trigger-saves with this header)
TRIGGER_SAVES_SECRET=your_random_secret_string

# Optional: app URL for OAuth redirect (defaults to https://yvshmusic.com)
NEXT_PUBLIC_APP_URL=https://yvshmusic.com
# For local dev: NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Admin stats (your one link)

Only you should see presave counts and run the release-day trigger. Use your **admin link**:

**Your admin URL:**  
`https://yvshmusic.com/admin/YOUR_TRIGGER_SAVES_SECRET`

Replace `YOUR_TRIGGER_SAVES_SECRET` with the same value as `TRIGGER_SAVES_SECRET` in your env. **Bookmark that URL** — it’s the only link you need. Don’t share it.

- **Stats** update automatically every 4 seconds.
- **“Trigger saves now”** runs the release-day save for all presaved fans.
- If the link is wrong or expired, the page shows “Invalid or expired link”.

## Spotify app setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
2. Create an app (e.g. "YVSH Music").
3. **Redirect URI**: add `https://yvshmusic.com/api/spotify/callback` (and for local dev: `http://localhost:3000/api/spotify/callback`).
4. Copy Client ID and Client Secret into env.
5. **Quota**: In Development Mode only 25 users can authorize. Submit a **quota extension request** in the dashboard before your first campaign so unlimited fans can presave.

## Supabase: `presaves` table

Run in Supabase SQL editor:

```sql
create table if not exists presaves (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  spotify_user_id text not null,
  refresh_token text not null,
  email text,
  saved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists presaves_campaign_id on presaves (campaign_id);
create index if not exists presaves_spotify_user_id on presaves (spotify_user_id);

-- RLS: disable public access; API uses service role
alter table presaves enable row level security;

create policy "Service role only"
  on presaves for all
  using (false);
```

(With RLS enabled and a policy that allows no one, only the service role key can read/write.)

## Release day: trigger saves

1. Once the track is live on Spotify, copy the track URI (e.g. `spotify:track:4iV5W9uYEdYUVa79Axb7Rh`).
2. Set `campaign.spotify.trackUri` in `src/config/campaign.ts` to that URI (or pass it in the request body).
3. Call the trigger endpoint:

```bash
curl -X POST https://yvshmusic.com/api/trigger-saves \
  -H "Authorization: Bearer YOUR_TRIGGER_SAVES_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Optional: pass `trackUri` in the body instead of config:

```bash
curl -X POST https://yvshmusic.com/api/trigger-saves \
  -H "Authorization: Bearer YOUR_TRIGGER_SAVES_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"trackUri": "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"}'
```

The endpoint processes fans in batches (50 at a time, 150ms delay) to respect Spotify rate limits and Vercel’s function timeout.

## Vercel Cron (optional)

To run trigger-saves automatically after the release date, add in `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/trigger-saves",
    "schedule": "0 0 * * *"
  }]
}
```

Then in the trigger-saves route, only run when `releaseDate` has passed and `trackUri` is set; call with the secret in a header (cron can send a secret header).
