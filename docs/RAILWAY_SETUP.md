# Hosting on Railway

The site runs as one always-on Node server on Railway (`npm run start`).
Supabase, SoundCloud and Google Drive don't change — only where the
Next.js app runs.

## Why Railway rather than Vercel Hobby

| | Vercel Hobby | Railway |
| --- | --- | --- |
| Scheduled jobs | once a day max (more often fails the deploy) | every 5 minutes, built in (`src/lib/scheduler.ts`) |
| 30-minute release rollout | no — takes a day | yes |
| Request time limit | per-function cap | none |
| Response size | 4.5 MB per function | none — streaming a file is possible |
| Visitor country | free header | offline lookup (`geoip-country`), IP never stored |
| Global CDN | yes | no — one region, so slightly slower far away |

## What's Railway-specific in the code

- `railway.json` — start command, health check (`/api/health`), restart on failure.
- `src/instrumentation.ts` + `src/lib/scheduler.ts` — the built-in cron. Runs in
  Railway's **production** environment automatically (`RUN_SCHEDULER=1` forces it
  on anywhere, `RUN_SCHEDULER=0` forces it off). Every 5 minutes it calls
  `/api/cron/subscribers`; once a day after 06:00 UTC it calls `/api/cron/stats`
  if today has no snapshot. Never overlaps itself, waits 5 minutes after boot so
  a deploy's old and new servers can't both run it, and stops on shutdown.
  Without `CRON_SECRET` it still runs, on a per-process secret.
- **`/api/scheduler`** — public status check: is the cron on (and if not, why),
  when it last ran and what it answered, and how many saved fans are overdue
  for a refresh. Counts only, no names. `curl https://www.yvshmusic.com/api/scheduler`
  after any deploy.
- `src/lib/statsRefresh.ts` — each download re-takes the SoundCloud stats
  snapshot about a minute later (bursts share one run, at most one every
  5 minutes). Relies on the server staying up after the response, which
  Railway does.
- `SOUNDCLOUD_REDIRECT_URI` must be the real domain
  (`https://www.yvshmusic.com/api/soundcloud/callback`), matching the
  SoundCloud app exactly, or Connect lands on a dead page.
- No `vercel.json` and no platform cron — the schedule lives in the server, so
  there's exactly one of it.

## Moving it

1. **Railway → New Project → Deploy from GitHub repo →** `Music-Profile-Website`, branch `main`.
2. **Variables** (service → Variables). Copy every **Production** value from
   Vercel → Settings → Environment Variables. Don't copy from `.env.local` —
   its URLs point at localhost. You need:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SOUNDCLOUD_CLIENT_ID`,
   `SOUNDCLOUD_CLIENT_SECRET`, `SOUNDCLOUD_REDIRECT_URI`, `SOUNDCLOUD_ARTIST_ID`,
   `NEXT_PUBLIC_SOUNDCLOUD_URL`, `NEXT_PUBLIC_ARTIST_NAME`,
   `TRIGGER_SAVES_SECRET`, `ADMIN_PASSWORD`, `RELEASE_TRIGGER_SECRET`, and —
   only if Vercel has them — `GATE_SECRET`,
   `DOWNLOAD_FILENAME`, `S3_*`. Skip `VERCEL_OIDC_TOKEN`.
   (That's every variable the code reads.)
   Then add two:
   - `RUN_SCHEDULER` = `1`
   - `CRON_SECRET` = any long random string (`openssl rand -base64 32`). It's
     only used by the server calling itself now.
   `NEXT_PUBLIC_*` values are baked in at build time — set them **before** the
   first build, or redeploy after.

   **Keep `GATE_SECRET` (or `SOUNDCLOUD_CLIENT_SECRET` if there's no
   GATE_SECRET) exactly the same** — it encrypts fans' gate cookies, and a
   different value just means every fan has to reconnect once.
3. **Deploy**, then open the `*.up.railway.app` link: pages and the admin should
   load. SoundCloud *Connect* won't work on that address — SoundCloud only
   redirects back to your real domain — that's expected.
4. **Domain** (service → Settings → Networking → Custom Domain): add
   `www.yvshmusic.com`. Railway shows a CNAME target (and maybe a TXT record).
   In **GoDaddy → DNS**: change the `www` CNAME from Vercel's value to
   Railway's, and add the TXT if asked. The bare `yvshmusic.com` can't point at
   Railway from GoDaddy (no apex CNAME), so use **GoDaddy → Forwarding** to send
   `yvshmusic.com` → `https://www.yvshmusic.com` (permanent 301).
5. Once `https://www.yvshmusic.com` serves from Railway (DNS can take up to an
   hour): connect SoundCloud on a gate to test the full flow, then check the
   Railway logs for `[scheduler] /api/cron/subscribers -> 200` within 10 minutes.
6. **Delete the Vercel project** (or at least remove the domain from it), so
   nothing old keeps running.

## Cost

Railway Hobby is $5/month and includes $5 of usage. A small Next.js server
like this one usually lands around that; check **Usage** after the first week.
