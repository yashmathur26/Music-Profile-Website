import { NextRequest, NextResponse } from "next/server";
import { LEFT_ALONE_PREFIX, TAKEN_OUT, loadProfile } from "@/lib/fanScreen";
import {
  ReleaseAction,
  ReleaseSubscriber,
  findAnnouncement,
  listActions,
  listAllSubscribers,
  putBack,
  requestAnnouncement,
  reschedule,
  stopAnnouncement,
  subscriptionsConfigured,
  takeOut
} from "@/lib/releaseSubscribers";
import { runSchedulerSoon, schedulerStatus } from "@/lib/scheduler";
import { lastReachedAt } from "@/lib/releaseRun";
import { appGet, appGetAll, numericId, resolveTrackMeta } from "@/lib/soundcloud";
import { FanSnapshot, SnapshotData, isUnresolved, latestSnapshot } from "@/lib/statsSnapshot";
import { normalizePlan, planIsNoop, removalDueAt, spreadRemoval } from "@/lib/subscriberPlan";
import { createServerSupabase } from "@/lib/supabaseServer";
import { findTrack, planToRow, updateTrack } from "@/lib/trackStore";
import { TrackConfig, getTrackPermalink } from "@/lib/tracks";
import type { BoostEdit, BoostPerson, BoostState, SongBoost } from "@/lib/songBoostTypes";

export const dynamic = "force-dynamic";

/** Same credential as every other admin route. */
const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  return bearer === secret || key === secret;
};

/**
 * Live SoundCloud reads for one song, kept for a minute. The panel refreshes
 * while a rollout is going out, and SoundCloud's rate limit is shared with
 * the live site, so the counters and liker lists are read at most once a
 * minute however often it asks.
 */
const LIVE_TTL_MS = 60_000;
/** Profiles barely move; ten minutes, same as the Fans tab. */
const PROFILE_TTL_MS = 10 * 60_000;
/** Live profile lookups per load, for fans the snapshot doesn't have. */
const PROFILE_LOOKUP_CAP = 60;
const CACHE_KEY = Symbol.for("yvsh.songBoostLive");
const cacheStore = globalThis as typeof globalThis & {
  [CACHE_KEY]?: Map<string, { at: number; value: unknown }>;
};
const cached = async <T>(
  key: string,
  fn: () => Promise<T>,
  ttl = LIVE_TTL_MS
): Promise<T | null> => {
  const cache = (cacheStore[CACHE_KEY] ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  try {
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error(`[song-boost] ${key} failed`, error);
    return null;
  }
};

type ScItem = { id?: number | string; urn?: string };
type ScTrack = ScItem & {
  playback_count?: number;
  likes_count?: number;
  favoritings_count?: number;
  reposts_count?: number;
  comment_count?: number;
};

const trackIdFor = async (track: TrackConfig) => {
  const direct = numericId(track.soundcloudTrackId);
  if (direct) return direct;
  const permalink = getTrackPermalink(track);
  return permalink ? (await resolveTrackMeta(permalink)).id : "";
};

const NOTES: Record<string, string> = {
  you_follow: "You follow them",
  big_account: "Big account",
  many_uploads: "Makes their own music",
  gone: "Account deleted",
  invalid_grant: "Disconnected from your site",
  no_refresh_token: "Disconnected from your site",
  no_grant: "Disconnected, so it couldn't be taken off",
  soundcloud_403: "SoundCloud refused",
  soundcloud_429: "SoundCloud said slow down",
  followings_unavailable: "Couldn't check who you follow"
};
const noteFor = (code: string | null) =>
  !code ? null : NOTES[code] || (code.startsWith("profile_") ? "Couldn't look them up" : code);

/** Where one fan stands on this song — see BoostState. */
const stateOf = (
  action: ReleaseAction | undefined,
  sent: boolean
): { state: BoostState; note: string | null } => {
  if (!action) return { state: sent ? "waiting" : "not_sent", note: null };
  if (action.error === TAKEN_OUT) return { state: "taken_out", note: null };
  if (action.error?.startsWith(LEFT_ALONE_PREFIX)) {
    return { state: "skipped", note: noteFor(action.error.slice(LEFT_ALONE_PREFIX.length)) };
  }
  const up = action.liked || action.reposted;
  if (action.removed_at) {
    // A removal that couldn't happen leaves it up, and says why.
    return up
      ? { state: "live", note: noteFor(action.remove_error) }
      : { state: "came_off", note: null };
  }
  return up ? { state: "live", note: null } : { state: "failed", note: noteFor(action.error) };
};

/** Mirrors the cron: it runs every five minutes and reaches fans only in the
 * first 200 seconds of each run (see /api/cron/subscribers). */
const TICK_MS = 5 * 60_000;
const SPREAD_MS = 200_000;

/**
 * The moment something due at `t` actually happens: `t` itself if a run is
 * going then, otherwise the start of the next run. Without the scheduler's
 * clock (a laptop, say) the guess is just `t`.
 */
const onTick = (t: number, nextTick: number | null, window = SPREAD_MS) => {
  if (!nextTick) return t;
  let tick = nextTick - TICK_MS;
  while (t > tick + window) tick += TICK_MS;
  return Math.max(t, tick);
};

const ORDER: BoostState[] = ["live", "waiting", "came_off", "taken_out", "failed", "skipped", "not_sent"];

const loadGate = async (slug: string) => {
  const supabase = createServerSupabase();
  const empty = { views: 0, downloads: 0, fans: 0, firstDownloadAt: null as string | null };
  if (!supabase) return empty;

  const rows: { sc_username: string | null; sc_profile_url: string | null; created_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("downloads")
      .select("sc_username, sc_profile_url, created_at")
      .eq("track_slug", slug)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) break;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { count: views } = await supabase
    .from("gate_events")
    .select("*", { count: "exact", head: true })
    .eq("track_slug", slug)
    .eq("kind", "view");

  const people = new Set(
    rows
      .map((r) => (r.sc_profile_url || r.sc_username || "").toLowerCase())
      .filter(Boolean)
  );
  return {
    views: views ?? 0,
    downloads: rows.length,
    fans: people.size,
    firstDownloadAt: rows[0]?.created_at || null
  };
};

const loadHistory = async (slug: string): Promise<SongBoost["history"]> => {
  const supabase = createServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stats_snapshots")
    .select("day, tracks:data->tracks")
    .order("day", { ascending: true })
    .limit(400);
  if (error || !data) return [];
  return (data as { day: string; tracks: SnapshotData["tracks"] | null }[])
    .map((row) => ({ day: row.day, t: row.tracks?.[slug] }))
    .filter((row) => row.t)
    .map(({ day, t }) => ({ day, plays: t!.plays, likes: t!.likes, reposts: t!.reposts }));
};

/**
 * Everything the song panel shows: SoundCloud's all-time counters for the
 * track, what the gate did, and where every saved fan stands on this song's
 * boost — who it reached, what's on their profile right now, and when it
 * comes off.
 */
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const track = await findTrack(params.slug);
  if (!track) {
    return NextResponse.json({ error: `No gate at /${params.slug}.` }, { status: 404 });
  }
  const slug = track.slug;
  const configured = subscriptionsConfigured();

  let subscribers: ReleaseSubscriber[] = [];
  let actions: ReleaseAction[] = [];
  let announcement: Awaited<ReturnType<typeof findAnnouncement>> = null;
  try {
    if (configured) {
      [subscribers, actions, announcement] = await Promise.all([
        listAllSubscribers(),
        listActions(slug),
        findAnnouncement(slug).catch(() => null)
      ]);
    }
  } catch (error) {
    console.error("[song-boost] could not load the boost", error);
    return NextResponse.json({ error: "Couldn't load your saved fans." }, { status: 503 });
  }

  const [gate, history, snapshot, trackId] = await Promise.all([
    loadGate(slug).catch(() => ({ views: 0, downloads: 0, fans: 0, firstDownloadAt: null })),
    loadHistory(slug).catch(() => []),
    latestSnapshot().catch(() => null),
    cached(`id:${slug}:${track.soundcloudUrl || track.soundcloudTrackId}`, () => trackIdFor(track))
  ]);

  const [meta, likers, reposters] = trackId
    ? await Promise.all([
        cached(`track:${trackId}`, () => appGet<ScTrack>(`/tracks/${trackId}`)),
        actions.length
          ? cached(`likers:${trackId}`, () =>
              appGetAll<ScItem>(`/tracks/${trackId}/favoriters`).then((items) =>
                items.map((i) => numericId(i.id ?? i.urn))
              )
            )
          : null,
        actions.length
          ? cached(`reposters:${trackId}`, () =>
              appGetAll<ScItem>(`/tracks/${trackId}/reposters`).then((items) =>
                items.map((i) => numericId(i.id ?? i.urn))
              )
            )
          : null
      ])
    : [null, null, null];

  const fromSnapshot = snapshot?.data.tracks[slug];
  const stats = meta
    ? {
        plays: meta.playback_count ?? 0,
        likes: meta.likes_count ?? meta.favoritings_count ?? 0,
        reposts: meta.reposts_count ?? 0,
        comments: meta.comment_count ?? 0
      }
    : fromSnapshot
      ? {
          plays: fromSnapshot.plays,
          likes: fromSnapshot.likes,
          reposts: fromSnapshot.reposts,
          comments: fromSnapshot.comments
        }
      : null;

  // Profile pictures and follower counts: the stats snapshot where it has
  // the fan, a live lookup (cached) where it doesn't.
  type Profile = { username: string; avatarUrl: string | null; followers: number; permalinkUrl: string };
  const profiles = new Map<string, Profile>();
  for (const fan of Object.values(snapshot?.data.fans || {})) {
    if (!isUnresolved(fan)) profiles.set(fan.id, fan as FanSnapshot);
  }
  const missing = subscribers
    .filter((sub) => !profiles.has(sub.sc_user_id) && (!sub.revoked_at || actions.some((a) => a.subscriber_id === sub.id)))
    .slice(0, PROFILE_LOOKUP_CAP);
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async (sub) => {
        const found = await cached(`profile:${sub.sc_user_id}`, () => loadProfile(sub.sc_user_id), PROFILE_TTL_MS);
        if (found) profiles.set(sub.sc_user_id, found);
      })
    );
  }

  const plan = normalizePlan(track.subscriberPlan);
  const sent = Boolean(announcement && announcement.status !== "stopped");
  const bySubscriber = new Map(actions.map((a) => [a.subscriber_id, a]));
  const likerSet = likers ? new Set(likers) : null;
  const reposterSet = reposters ? new Set(reposters) : null;

  // `queuedSince` is the queue order; it's dropped before the reply.
  const people: (BoostPerson & { queuedSince: string })[] = subscribers
    // Everyone this song touched, plus everyone still saved who it could.
    .filter((sub) => bySubscriber.has(sub.id) || !sub.revoked_at)
    .map((sub) => {
      const action = bySubscriber.get(sub.id);
      const profile = profiles.get(sub.sc_user_id);
      const { state, note } = stateOf(action, sent);
      const touched = state === "live" || state === "came_off";
      return {
        id: sub.id,
        username: profile?.username || sub.sc_username || "Unknown",
        profileUrl: profile?.permalinkUrl || sub.sc_profile_url,
        avatarUrl: profile?.avatarUrl || null,
        followers: profile?.followers ?? null,
        state,
        liked: Boolean(action?.liked),
        reposted: Boolean(action?.reposted),
        likedNow: touched && likerSet ? likerSet.has(sub.sc_user_id) : null,
        repostedNow: touched && reposterSet ? reposterSet.has(sub.sc_user_id) : null,
        reachedAt: action && touched ? action.created_at : null,
        removeAfter: action?.remove_after || null,
        removedAt: action?.removed_at || null,
        dueAt: null as string | null,
        offAt: null as string | null,
        note,
        queuedSince: sub.created_at
      };
    });

  const going = announcement && ["pending", "running"].includes(announcement.status);
  const nextTick = Date.parse(schedulerStatus().nextTickAt || "") || null;
  const now = Date.now();

  // Who the send reaches next, and when: the queue goes oldest saved fan
  // first, one gap after the last fan it reached, fitted to the runs.
  if (going) {
    const reachedInDb = actions
      .filter((a) => a.liked || a.reposted)
      .reduce((latest, a) => Math.max(latest, Date.parse(a.created_at) || 0), 0);
    let at = Math.max(now, Math.max(lastReachedAt(slug), reachedInDb) + plan.gapSeconds * 1000);
    for (const person of people
      .filter((p) => p.state === "waiting")
      .sort((a, b) => a.queuedSince.localeCompare(b.queuedSince))) {
      at = onTick(at, nextTick);
      person.dueAt = new Date(at).toISOString();
      at += plan.gapSeconds * 1000;
    }
  }

  // When each like/repost actually comes off: the first run after its
  // deadline (a teardown runs at the start of one, not spread across it).
  for (const person of people) {
    const deadline = Date.parse(person.removeAfter || "");
    const takenOutPending = person.state === "taken_out" && (person.liked || person.reposted) && !person.removedAt;
    if ((person.state === "live" && deadline) || takenOutPending) {
      person.offAt = new Date(onTick(Math.max(now, deadline || now), nextTick, 0)).toISOString();
    }
  }

  people.sort(
    (a, b) =>
      ORDER.indexOf(a.state) - ORDER.indexOf(b.state) ||
      (a.dueAt || "").localeCompare(b.dueAt || "") ||
      (a.offAt || "").localeCompare(b.offAt || "") ||
      (b.followers ?? -1) - (a.followers ?? -1)
  );
  const payload: SongBoost = {
    checkedAt: new Date().toISOString(),
    song: {
      slug,
      title: track.title,
      artworkUrl: track.artworkUrl,
      url: getTrackPermalink(track) || ""
    },
    stats,
    history,
    gate,
    boost: {
      configured,
      plan,
      announcement: announcement
        ? {
            status: announcement.status,
            startedAt: announcement.started_at,
            requestedAt: announcement.requested_at,
            completedAt: announcement.completed_at,
            lastError: announcement.last_error
          }
        : null,
      // The last waiting fan's turn.
      finishesAt: people.reduce<string | null>(
        (latest, p) => (p.dueAt && (!latest || p.dueAt > latest) ? p.dueAt : latest),
        null
      ),
      people: people.map(({ queuedSince: _q, ...person }) => person)
    }
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Edits one song's boost after it's gone out: take fans out (one, several or
 * everyone), put them back, change how long it stays up, or change how fast
 * the rest goes out. Every SoundCloud write still happens in the cron — this
 * only moves deadlines and markers — so nothing here can race the rollout on
 * a fan's single-use refresh token.
 */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!subscriptionsConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured." }, { status: 503 });
  }
  const track = await findTrack(params.slug);
  if (!track) {
    return NextResponse.json({ error: `No gate at /${params.slug}.` }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<BoostEdit>;
  const ids =
    "ids" in body && Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && id !== "")
      : null;
  const slug = track.slug;
  const plan = normalizePlan(track.subscriberPlan);

  const savePlan = async (patch: Record<string, unknown>) => {
    const wanted = normalizePlan({ ...plan, ...patch });
    const { planStored } = await updateTrack(slug, planToRow(wanted));
    // "Not stored" can mean only the newest column is missing; complain only
    // if the field this edit was about didn't take.
    const stored = normalizePlan((await findTrack(slug))?.subscriberPlan);
    const took = Object.keys(patch).every(
      (key) => stored[key as keyof typeof stored] === wanted[key as keyof typeof wanted]
    );
    if (!planStored && !took) {
      throw new Error(
        "The subscriber settings need the newest columns. Run the SQL in docs/ADMIN_TRACKS_SETUP.md."
      );
    }
  };

  try {
    switch (body.action) {
      case "take_out": {
        let targets = ids;
        if (!targets) {
          // Everyone: stop what's still going out, and take down what's up.
          // Fans skipped for their own reasons keep those reasons.
          await stopAnnouncement(slug);
          const [subs, actions] = await Promise.all([listAllSubscribers(), listActions(slug)]);
          const skipped = new Set(
            actions
              .filter((a) => a.error?.startsWith(LEFT_ALONE_PREFIX) && a.error !== TAKEN_OUT)
              .map((a) => a.subscriber_id)
          );
          targets = [
            ...new Set([
              ...actions.map((a) => a.subscriber_id),
              ...subs.filter((s) => !s.revoked_at).map((s) => s.id)
            ])
          ].filter((id) => !skipped.has(id));
        }
        await takeOut({ trackSlug: slug, subscriberIds: targets, marker: TAKEN_OUT });
        const soon = runSchedulerSoon();
        return NextResponse.json({ ok: true, soon });
      }

      case "put_back": {
        await putBack({
          trackSlug: slug,
          subscriberIds: ids,
          marker: TAKEN_OUT,
          removeAfter: removalDueAt(plan)
        });
        // Anything that already came off goes back up on a send. Only when
        // this song has been sent before — putting someone back isn't a
        // reason to send a song you haven't.
        const announcement = await findAnnouncement(slug).catch(() => null);
        if (announcement && !planIsNoop(plan)) await requestAnnouncement(slug);
        return NextResponse.json({ ok: true });
      }

      case "keep_for": {
        const raw = (body as { days?: unknown }).days;
        const days = raw === null ? null : normalizePlan({ retainDays: raw }).retainDays;
        if (raw !== null && days === null) {
          return NextResponse.json({ error: "Pick how many days." }, { status: 400 });
        }
        // The song's setting moves too when it's everyone, so fans the
        // rollout hasn't reached yet get the same.
        if (!ids) await savePlan({ retainDays: days });
        const changed = await reschedule({
          trackSlug: slug,
          subscriberIds: ids,
          skipMarker: TAKEN_OUT,
          due: (action) =>
            days === null
              ? null
              : spreadRemoval(
                  removalDueAt({ ...plan, retainDays: days }, new Date(action.created_at)),
                  plan
                )
        });
        return NextResponse.json({ ok: true, changed });
      }

      case "pace": {
        const seconds = Number((body as { seconds?: unknown }).seconds);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          return NextResponse.json({ error: "Pick how far apart." }, { status: 400 });
        }
        // The send reads the gap fresh every tick, so one that's already
        // going speeds up or slows down from the next fan.
        await savePlan({ gapSeconds: seconds });
        return NextResponse.json({ ok: true });
      }

      case "removal_pace": {
        const minutes = Number((body as { minutes?: unknown }).minutes);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          return NextResponse.json({ error: "Pick how slowly." }, { status: 400 });
        }
        await savePlan({ removalMinutes: minutes });
        // Re-spread what's already scheduled over the new window, so the
        // change applies to this send. Each fan keeps their own number of
        // days: the spread is under a day, so flooring recovers it.
        const next = normalizePlan({ ...plan, removalMinutes: minutes });
        await reschedule({
          trackSlug: slug,
          subscriberIds: null,
          skipMarker: TAKEN_OUT,
          due: (action) => {
            if (action.remove_after === null) return null;
            const reached = Date.parse(action.created_at);
            const days = Math.max(
              1,
              Math.floor((Date.parse(action.remove_after) - reached) / 86_400_000)
            );
            return spreadRemoval(new Date(reached + days * 86_400_000).toISOString(), next);
          }
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    console.error(`[song-boost] ${body.action} failed`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 500 }
    );
  }
}
