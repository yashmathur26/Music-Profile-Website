# Automatic likes & reposts on new releases — Setup

Fans who download a track can tick an optional box:

> ☐ Automatically like and repost YVSH's future releases from my SoundCloud

Tick it and we keep their SoundCloud connection, refresh it once a day, and
when you drop a new song one call likes and reposts it from every opted-in
account.

## The consent model, and why it's built this way

The box is **unchecked by default** and the download works without it. That is
deliberate, not caution for its own sake:

- A fan who unlocks a gate is agreeing to follow and like **that** track. Using
  the same token weeks later for a different track is a separate thing, so it
  gets a separate yes.
- SoundCloud's API terms expect writes to be user-initiated. A burst of
  background likes from one client ID, with no consent record behind it, is the
  pattern that gets a client ID pulled — which would take the whole gate down,
  not just this feature.
- Every subscriber gets a permanent, login-free off switch
  (`/unsubscribe?t=…`), shown on screen the moment they opt in — and the same
  page is linked from the Terms, which the bottom-right corner of every page
  links to.

Only **like** and **repost** ever run automatically. Follows and comments do
not: a fan who unfollowed shouldn't be re-followed behind their back, and
comments aren't idempotent, so a retry would post twice.

## 1. Database migration

Run in the Supabase SQL editor:

```sql
create table if not exists release_subscribers (
  id                uuid primary key default gen_random_uuid(),
  sc_user_id        text not null unique,
  sc_username       text,
  sc_profile_url    text,
  access_token      text,
  refresh_token     text not null default '',
  expires_at        timestamptz,
  revoke_token      text not null unique,
  source_track_slug text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_refreshed_at timestamptz,
  revoked_at        timestamptz,
  revoked_reason    text
);

-- The release run and the cron both read "everyone still opted in".
create index if not exists release_subscribers_active_idx
  on release_subscribers (created_at)
  where revoked_at is null;

-- One row per (fan, release): makes re-running a release safe.
create table if not exists release_actions (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references release_subscribers(id) on delete cascade,
  track_slug    text not null,
  liked         boolean not null default false,
  reposted      boolean not null default false,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (subscriber_id, track_slug)
);

-- The queue behind the portal's "Tell my subscribers" checkbox. One row per
-- release; the cron drains it in chunks.
create table if not exists release_announcements (
  id           uuid primary key default gen_random_uuid(),
  track_slug   text not null unique,
  status       text not null default 'pending',
  requested_at timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz,
  processed    integer not null default 0,
  liked        integer not null default 0,
  reposted     integer not null default 0,
  failed       integer not null default 0,
  last_error   text,
  updated_at   timestamptz not null default now()
);

-- Tokens: service role only. No anon/authenticated policies are created, so
-- RLS being on with zero policies denies every client-side read.
alter table release_subscribers   enable row level security;
alter table release_actions       enable row level security;
alter table release_announcements enable row level security;
```

## 2. Environment variables

```bash
CRON_SECRET=...              # daily token keepalive; Vercel Cron sends this
RELEASE_TRIGGER_SECRET=...   # protects the release fan-out
```

Generate each with `openssl rand -base64 32`. Without `CRON_SECRET` the cron
route returns 401 and the connections go stale; without
`RELEASE_TRIGGER_SECRET` the fan-out can't be called at all.

The feature also needs the SoundCloud OAuth vars and Supabase service role key
the gate already uses. Miss any of them and the checkbox simply doesn't render.

## 3. The cron

One cron does all the background work, registered in `vercel.json` and
authorised with `CRON_SECRET`:

```json
{ "path": "/api/cron/subscribers", "schedule": "*/10 * * * *" }
```

Every tick it does exactly one of two jobs, never both.

**Draining the release queue** — the oldest unfinished release, up to 150 fans,
then stop. A release with more subscribers finishes over the following ticks.
It's a queue rather than something that runs when you press the button because
the fan-out can outlive any single request (a slow send would otherwise read
back to you as "the song didn't save"), and because trickling the writes beats
firing every account at SoundCloud in the same second.

**Keepalive** — when the queue is empty, it refreshes the grants untouched for
20 hours, 100 per tick. An unused refresh token can be aged out, and a fan
revoking access on SoundCloud's side notifies us of nothing, so without this
we'd only find out mid-release. Dead grants are retired here instead, marked
`revoked_reason = 'token_invalid'`, which keeps the subscriber count honest.

### Why one cron and not two

This started as two — a daily keepalive and a ten-minute queue drain — and
that was a bug. `*/10 * * * *` fires at 04:00 as well, so once a day both
would refresh the same fan at the same moment. SoundCloud's refresh tokens are
single-use: the loser of that race ends up holding a token SoundCloud has
already retired, which comes back as `invalid_grant` — indistinguishable from
a fan who revoked access, so the code would unsubscribe them for good. Silent
daily attrition, visible only as a subscriber count that drifts down.

Serialising the work removes the race by construction rather than hoping two
schedules never collide. `maxDuration` is held under the interval so a run
can't overlap itself either.

## 4. Dropping a new song

### From the portal (the normal way)

Add the gate in Admin → **Songs** as usual. Once the track is public on
SoundCloud, tick **Tell my subscribers** on the create form and the release is
queued the moment the gate is created. The checkbox only appears when you
actually have subscribers, and it says how many.

Each live gate also carries a button with the same effect — **Like + repost
from N** — for a song whose gate already existed, or to retry one that
stopped. The button doubles as the progress readout: *Sending… 40/150*, then
*Sent to 150*. Re-running is safe; anyone already liked and reposted is
skipped.

### By hand

The manual endpoint runs the fan-out inline instead of queueing it:

```bash
# Dry run first — counts only, touches nobody.
curl -X POST https://yvshmusic.com/api/releases/announce \
  -H "Authorization: Bearer $RELEASE_TRIGGER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"track":"new-song-slug","dryRun":true}'

# For real.
curl -X POST https://yvshmusic.com/api/releases/announce \
  -H "Authorization: Bearer $RELEASE_TRIGGER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"track":"new-song-slug"}'
```

The response reports `subscribers`, `liked`, `reposted`, `failed`,
`revokedDeadTokens` and `remaining`.

- **Safe to re-run.** Every fan's result is recorded per release and anyone
  already liked *and* reposted is skipped, so a second call only picks up who
  was missed.
- **Long lists:** pass `{"limit": 200}` and call it again until `remaining` is
  0. The route caps at 300s on Vercel.
- **`abortedReason: "rate_limited"`** — SoundCloud pushed back. Wait and
  re-run; progress is kept.
- **`abortedReason: "api_blocked"`** — five consecutive 403s, so the run stops
  rather than hammering the API. That's the June 2026 write-API pause described
  in `SOUNDCLOUD_GATE_SETUP.md`; the subscriptions keep accruing and a re-run
  later catches everyone up.

## How a token's lifetime actually works

SoundCloud's refresh tokens are **single-use** — refreshing returns a new one
and invalidates the old. Two places could hold the same token, so:

- At opt-in, `/api/soundcloud/subscribe` refreshes **once** to mint a pair for
  the subscription, stores it, and **strips the refresh token from the gate
  cookie**. Otherwise the gate and the subscription would rotate each other's
  token out from under them — and the loser is usually the subscription, weeks
  later, silently. The visit keeps working on its access token.
- Only one job may refresh a given fan at a time, which is why the cron (04:00)
  and the release fan-out are never scheduled together. Run a release at 04:00
  and the overlap shows up as `failed` rows, not corruption — re-run it.
- If writing the rotated token back to Supabase fails, the access token is
  thrown away rather than used, because its successor is lost.

## The two ways a fan reaches the off switch

`/unsubscribe` has to work both with and without a token, because it is
advertised in two places:

- **`?t=<revoke_token>`** — the personal link shown on the download screen.
  Works forever, from any device, no login. This is the one that matters.
- **No query string** — the "Turn off automatic likes and reposts" link in the
  Terms, reachable from the bottom-right corner of every page. There is no
  token in that case, so the page identifies the visitor from their gate
  cookie. That only works in the browser they downloaded from; when it finds
  nothing, the page says so and points at SoundCloud's own Settings →
  Connections, which cuts access off regardless of anything on our side.

A token that doesn't resolve falls back to the cookie rather than dead-ending,
so a fan who mangled their link still has a way through.

## Switching a fan off by hand

```sql
update release_subscribers
   set access_token = null, refresh_token = '',
       revoked_at = now(), revoked_reason = 'admin'
 where sc_username = '<handle>';
```

Or send them `https://yvshmusic.com/unsubscribe?t=<their revoke_token>`.

## What is not built

- **No release email.** A fan who loses their personal link and clears their
  cookies needs the Contact page, or SoundCloud's own Connections settings.
- **Tokens are stored unencrypted**, matching the existing `presaves` table.
  Encrypting them at rest is worth doing; it needs a key-rotation story first,
  since an unreadable token is an invisibly dead subscriber.
