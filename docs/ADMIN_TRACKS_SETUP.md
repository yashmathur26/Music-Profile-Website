# Admin track gates — one-time setup

The admin page (`/admin/<TRIGGER_SAVES_SECRET>`) can mint new download gates
from a Google Drive link + a SoundCloud link. Runtime-added tracks are stored
in Supabase (the deploy's filesystem is read-only), so the table below must
exist once per project.

Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query):

```sql
create table if not exists public.gate_tracks (
  slug text primary key,
  title text not null,
  artwork_url text,
  download_url text not null,
  soundcloud_url text not null,
  soundcloud_track_id text,
  created_at timestamptz not null default now()
);

-- Server-only access: the service role key bypasses RLS; enabling it with no
-- policies means the anon/public key can't read or write anything.
alter table public.gate_tracks enable row level security;
```

That's it. Until the table exists the site serves the hard-coded tracks from
`src/lib/tracks.ts` and the admin "add" form reports the missing table.

Notes:

- The Google Drive file must be shared as "Anyone with the link" or fans'
  downloads will hit Drive's permission page.
- Deleting a gate from the admin page frees its slug; hard-coded tracks can't
  be deleted from the page.
