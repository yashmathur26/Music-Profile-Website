# Admin Stats tab — setup

The **Stats** tab in the admin dashboard reads three kinds of data:

| Source | Updates | What it powers |
| --- | --- | --- |
| `downloads`, `release_*` tables | live (re-read every minute) | downloads, fans, repeat rate, heatmap, saved fans |
| `gate_events` | live, from this deploy on | the funnel, traffic sources, countries, and how each download got through the gate |
| `stats_snapshots` | once a day (06:00 UTC) + **Refresh now** | SoundCloud followers/plays/likes over time, who still follows and likes, fan follower counts |

Your own SoundCloud account is excluded from every fan number.

## 1. SQL

Run once in the Supabase SQL editor. Safe to re-run.

```sql
-- One row per UTC day: SoundCloud's side of the stats.
create table if not exists stats_snapshots (
  day       date primary key,
  taken_at  timestamptz not null default now(),
  data      jsonb not null
);
alter table stats_snapshots enable row level security;

-- Every step a visitor takes on a gate.
create table if not exists gate_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  track_slug  text not null,
  kind        text not null,   -- view | manual | connect | connected | unlock | download
  session_id  text,            -- the gate_session cookie, joins a visitor's steps
  sc_username text,
  country     text,            -- from Vercel's edge, two letters
  referrer    text,            -- host, or utm:<source> when the link was tagged
  detail      jsonb            -- download: { gate: unlocked | connected_not_unlocked | no_connection }
);
create index if not exists gate_events_created_idx on gate_events (created_at);
create index if not exists gate_events_track_kind_idx on gate_events (track_slug, kind);
alter table gate_events enable row level security;
```

RLS is on with no policies, so only the server (service role) can read either.

## 2. The daily refresh

`vercel.json` registers `/api/cron/stats` at `0 6 * * *`, authorised with the
same `CRON_SECRET` as the subscriber cron. It uses the app's own SoundCloud
token only, never a fan's, so it can't collide with the subscriber cron's
single-use refresh tokens.

Each run reads your follower list and each song's likers once (paged), then
looks up every fan who has ever downloaded — about one request per fan. It
stops starting new lookups after four minutes; anyone it didn't reach keeps
the previous day's answer and the run is marked *partial*.

**Refresh now** on the tab takes the same snapshot on demand and replaces
today's row, so pressing it twice is harmless.

## 3. Reading the gate-integrity section

A download is logged with what the server could see at that moment:

- **Did the gate** — connected, and the follows went through.
- **Manual route** — no SoundCloud connection, but the same visitor took the
  "open SoundCloud yourself" fallback first. That route works on trust.
- **Connected, but follows never went through** — usually SoundCloud blocking
  the follow call.
- **Possible bypass** — no connection and no manual route. Someone fetched the
  download link directly.

"No longer following" and "unliked" come from the daily snapshot. Collaborator
accounts on multi-follow gates aren't checked — only your own account.

## 4. Tag your links

In-app browsers (Instagram, TikTok) often send no referrer, so those visits
land in *Direct / unknown*. Add `?utm_source=instagram` (or `tiktok`, `story`,
`bio`…) to links you post and the *Where visitors come from* chart becomes
exact.
