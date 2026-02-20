# Spotify Presave — Setup

Yes, the Spotify API is wired up: OAuth (authorize → callback), token exchange, and “save track to library” all work. You just need to create a Spotify app, set env vars, and create the Supabase table. Follow the steps below in order.

---

## Step-by-step: Get the Spotify API working

### Step 1 — Create a Spotify app

1. Go to **[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)** and log in.
2. Click **Create app**.
3. Fill in:
   - **App name:** e.g. `YVSH Presave`
   - **App description:** optional (e.g. `Presave for 10 outta 10`)
   - **Redirect URI:** add **both** of these (click “Add” for each):
     - `https://yvshmusic.com/api/spotify/callback`
     - `http://localhost:3000/api/spotify/callback` (for local testing)
   - **Website:** your site URL (e.g. `https://yvshmusic.com`)
   - **API/SDKs:** leave unchecked unless you need them.
4. Check the **Terms** box and click **Save**.
5. Open your new app → **Settings**. Copy **Client ID** and click **Show client secret** and copy **Client secret**. You’ll put these in `.env.local` next.

### Step 2 — Set environment variables

In your project root, create or edit **`.env.local`** (this file is gitignored; never commit it):

```bash
# Spotify (from Step 1)
SPOTIFY_CLIENT_ID=paste_your_client_id_here
SPOTIFY_CLIENT_SECRET=paste_your_client_secret_here

# Supabase (Step 3)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Admin + trigger (you choose a random secret; use it in your admin URL)
TRIGGER_SAVES_SECRET=some_long_random_string_you_make_up

# Optional: one-time reset of all presaves + cookies (GET /api/admin/reset-presaves?secret=THIS)
PRESAVE_RESET_SECRET=another_random_string

# For local dev only
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For **production** (e.g. Vercel), set the same variables in the Vercel project, and use `NEXT_PUBLIC_APP_URL=https://yvshmusic.com` (or your real domain).

### Step 3 — Create the Supabase `presaves` table

1. Go to [supabase.com](https://supabase.com) → your project (or create one).
2. Open **SQL Editor** and run the SQL from the [Supabase: `presaves` table](#supabase-presaves-table) section below (creates `presaves` table + RLS).
3. In **Project Settings → API**: copy **Project URL** → `SUPABASE_URL`, and **service_role** key (under “Project API keys”) → `SUPABASE_SERVICE_ROLE_KEY`. Put them in `.env.local` as in Step 2.

### Step 4 — Test the presave flow

1. Restart your dev server so it picks up `.env.local`:
   ```bash
   npm run dev
   ```
2. Open **http://localhost:3000** (with `NEXT_PUBLIC_APP_URL=http://localhost:3000`).
3. Click **Pre-save on Spotify**. You should be sent to Spotify to log in and authorize.
4. After authorizing, you should land on **/presave/success**.
5. Open your **admin page**:  
   `http://localhost:3000/admin/YOUR_TRIGGER_SAVES_SECRET`  
   (use the same value as `TRIGGER_SAVES_SECRET` in `.env.local`). You should see **Presaves: 1** (or more if you tested multiple times).

If anything fails:

- **Redirected to home or “Invalid or expired link”** → Check `SPOTIFY_CLIENT_ID`, redirect URIs in the Spotify dashboard, and that `presave` is `true` in `src/config/features.ts`.
- **OAuth error / callback fails** → Check the terminal or Vercel logs for “Spotify callback error”. Usually means wrong `redirect_uri`, wrong `SPOTIFY_CLIENT_SECRET`, or Supabase not configured (missing env or table).
- **Presaves count stays 0** → Check Supabase env vars and that the `presaves` table exists and RLS is set so only the service role can write (see SQL below).

### Step 5 — Production (when you deploy)

- In the **Spotify app** redirect URIs, keep `https://yvshmusic.com/api/spotify/callback` (you added it in Step 1).
- In **Vercel** (or your host), set all the same env vars and `NEXT_PUBLIC_APP_URL=https://yvshmusic.com`.
- Your admin URL in production: `https://yvshmusic.com/admin/YOUR_TRIGGER_SAVES_SECRET`.

### Ad blockers / cookie blockers

- The presave OAuth flow uses **signed state in the URL** (no cookies) for the Spotify redirect. So sign-in works even when users have ad blockers or strict cookie settings.
- The only cookie we set after a successful presave is `presave_id` (for optional email capture on the success page). If that cookie is blocked, the presave still completes; only “Notify me” email capture may not attach to their record.

### Spotify Development Mode (25 users)

---

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

## Reset presaves (start from scratch)

To wipe all presaves in the database and clear OAuth/presave cookies for your browser:

1. In `.env.local` and Vercel, set **`PRESAVE_RESET_SECRET`** to a random string (e.g. `openssl rand -hex 16`).
2. Visit: **`https://yvshmusic.com/api/admin/reset-presaves?secret=YOUR_PRESAVE_RESET_SECRET`** (use the same value as the env var).
3. You’ll be redirected to the homepage; all presave rows are deleted and your app cookies for this site are cleared.

Only use this when you want to reset everything. Keep the secret private.

## Spotify app setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
2. Create an app (e.g. "YVSH Music").
3. **Redirect URIs**: add both:
   - Presave: `https://yvshmusic.com/api/spotify/callback` (and `http://localhost:3000/api/spotify/callback` for local dev).
   - Stats: `https://yvshmusic.com/api/auth/spotify/callback` (and `http://localhost:3000/api/auth/spotify/callback` for local dev).
4. Copy Client ID and Client Secret into env.
5. **Quota**: In Development Mode only 25 users can authorize. Submit a **quota extension request** in the dashboard before your first campaign so unlimited fans can presave.

## Storing user data: safe and cheap

### What you store

Each presave is one row in the `presaves` table:

| Column | What it is | Why you need it |
|--------|------------|------------------|
| `id` | UUID | Primary key. |
| `campaign_id` | e.g. `10-outta-10` | Which release; lets you run triggers per campaign. |
| `spotify_user_id` | Spotify’s user ID | Identifies the fan; avoids saving twice for the same person. |
| `refresh_token` | Spotify OAuth refresh token | Lets you get a fresh access token on release day and call “save this track” for that user. |
| `email` | optional | Not used right now; there if you add email later. |
| `saved` | boolean | So you know who’s already been saved and don’t re-run. |
| `created_at` | timestamp | When they presaved. |

You do **not** store passwords, payment info, or anything except what’s above. The only sensitive value is the **refresh token** (so only your server should ever read it).

---

### Keeping it safe

1. **Secrets only in env**
   - `SPOTIFY_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SAVES_SECRET` live only in env (e.g. Vercel env vars or `.env.local`). They are never in the repo or sent to the browser.

2. **Database locked down (RLS)**
   - Supabase Row-Level Security is on for `presaves` with a policy that allows **no one** by default. Only your backend, using the **service role** key, can read/write. Browsers and anonymous users cannot query the table at all.

3. **No client-side DB access**
   - The frontend never talks to Supabase. It only calls your API routes. The service role key is used only in server-side code (API routes, server components). So users can’t touch the DB or see tokens.

4. **HTTPS only**
   - All traffic to your site and to Supabase/Spotify is over HTTPS, so data in transit is encrypted.

5. **Refresh tokens**
   - Stored in Supabase. Supabase encrypts data at rest. If you want an extra layer, you can add **application-level encryption**: encrypt the token with a key in env before saving, decrypt only in the trigger route when calling Spotify. (Not required for Supabase’s security; optional if you want token values protected even if someone got DB access.)

6. **Admin link**
   - Your stats/trigger URL contains your secret. Treat it like a password: bookmark it, don’t share it, use it only on your own device.

---

### Keeping it cheap

1. **Supabase free tier**
   - Free tier includes: **500 MB database**, **50,000 rows** in tables, generous API usage. One presave ≈ one row (~0.5 KB). So you can store **tens of thousands of presaves** before hitting limits. No credit card required for the free tier.

2. **Row size**
   - Each row is small: UUID, a few short strings (`campaign_id`, `spotify_user_id`), one longer string (`refresh_token`, ~200–400 chars), optional email, boolean, timestamp. Even 50,000 rows is only on the order of tens of MB, well under 500 MB.

3. **When you’d pay**
   - **Supabase:** Only if you outgrow free (e.g. many campaigns and 50K+ presaves total). Paid plans start around $25/mo.
   - **Vercel:** Serverless and hosting are fine on the free tier for this. You’d pay if you need more builds or higher limits.
   - **Spotify:** API use for presave (authorize + save track) is free; no extra cost for storing or using tokens.

So with one Supabase project and env vars set correctly, your user data stays safe and the setup stays free for a long time.

---

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

## Presave before the track is on Spotify

You can run the presave campaign **before** the track is on Spotify. Leave `campaign.spotify.trackUri` empty. When users click “Pre-save on Spotify” they sign in with Spotify and you store their Spotify user ID and refresh token—no track link needed yet. When the track is live, set `trackUri` in config and run “Trigger saves now” from your admin page (or call the trigger endpoint); the track will be added to every presaver’s library.

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
