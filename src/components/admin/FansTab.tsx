"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Fan, FanRelease, FansPayload } from "@/lib/fansTypes";
import { Empty, Section, StatTile, Status, compact } from "@/components/admin/statsCharts";

/**
 * The admin "Fans" tab: everyone who has downloaded, who they are on
 * SoundCloud, and how they engage with you — what they downloaded and
 * whether they still like it, whether they follow you, and whether your next
 * release will like and repost from their account. Replaces the separate
 * Downloads and Saved fans tabs; the live download feed sits on top.
 */

type FeedRow = {
  trackSlug: string;
  title: string;
  username: string | null;
  profileUrl: string | null;
  at: string | null;
};

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "follows", label: "Follow you" },
  { key: "unfollowed", label: "Unfollowed" },
  { key: "repeat", label: "Came back for more" },
  { key: "ready", label: "Get your next release" },
  { key: "left_alone", label: "Left alone" }
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const SORTS = [
  { key: "recent", label: "Latest activity" },
  { key: "engaged", label: "Most engaged" },
  { key: "downloads", label: "Most downloads" },
  { key: "followers", label: "Biggest accounts" }
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const PAGE = 40;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 45) return `${Math.round(s / 86400)}d ago`;
  return date(iso);
};
const normalUrl = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();

let regionNames: Intl.DisplayNames | null = null;
const countryName = (code: string) => {
  try {
    regionNames = regionNames || new Intl.DisplayNames(undefined, { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
};

/** Distinct songs, so downloading one song twice isn't "two songs". */
const songsOf = (fan: Fan) => {
  const bySlug = new Map<string, Fan["downloads"][number]>();
  for (const d of fan.downloads) if (!bySlug.has(d.slug)) bySlug.set(d.slug, d);
  return [...bySlug.values()];
};

/**
 * Four plain yes/no signals, so "engaged" means something you can check:
 * they follow you, they kept the likes on what they downloaded, they came
 * back for a second song, and your next release reaches them.
 */
const engagement = (fan: Fan) => {
  const songs = songsOf(fan);
  const known = songs.filter((s) => s.likesNow !== null);
  const kept = known.filter((s) => s.likesNow).length;
  return [
    { label: "Follows you", on: fan.followsYou === true },
    { label: "Kept their likes", on: known.length > 0 && kept === known.length },
    { label: "Downloaded 2+ songs", on: songs.length >= 2 },
    { label: "Gets your releases", on: fan.saved?.status === "ready" }
  ];
};
const score = (fan: Fan) => engagement(fan).filter((s) => s.on).length;

const Avatar = ({ url, size = 48 }: { url: string | null; size?: number }) =>
  url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-white/10 object-cover"
      loading="lazy"
    />
  ) : (
    <div style={{ width: size, height: size }} className="shrink-0 rounded-full bg-white/10" />
  );

const Check = ({ on }: { on: boolean | null }) =>
  on === null ? (
    <span className="text-white/30" title="Couldn't check">?</span>
  ) : on ? (
    <span className="text-emerald-400">✓</span>
  ) : (
    <span className="text-rose-300/80">✕</span>
  );

const Pill = ({ tone, children }: { tone: "green" | "gray" | "red" | "purple"; children: React.ReactNode }) => (
  <span
    className={clsx(
      "rounded-full px-2 py-0.5 text-[11px] font-medium",
      tone === "green" && "bg-emerald-500/15 text-emerald-300",
      tone === "gray" && "bg-white/10 text-white/60",
      tone === "red" && "bg-rose-500/15 text-rose-300",
      tone === "purple" && "bg-purple-500/20 text-purple-200"
    )}
  >
    {children}
  </span>
);

const leaveAloneText = (fan: Fan, rules: FansPayload["rules"]) => {
  switch (fan.saved?.leaveAloneReason) {
    case "you_follow":
      return "You follow them, so a like or repost would look like a personal shout-out.";
    case "big_account":
      return `Big account — ${compact(fan.followers ?? 0)} followers (the limit is ${rules.followers.toLocaleString()}).`;
    case "many_uploads":
      return `Puts out their own music — ${fan.uploads} uploads (the limit is ${rules.uploads}).`;
    case "gone":
      return "Their SoundCloud account no longer exists.";
    default:
      return null;
  }
};

const endedText = (fan: Fan) => {
  const when = fan.saved?.endedAt ? date(fan.saved.endedAt) : "";
  switch (fan.saved?.endedReason) {
    case "fan":
      return `They turned it off themselves on ${when} and won't be saved again.`;
    case "token_invalid":
      return `SoundCloud stopped letting us in on ${when} (they probably disconnected the app). They're saved again if they download again.`;
    case "admin":
      return `Removed by you on ${when}.`;
    default:
      return `Ended on ${when}.`;
  }
};

/** One release, as it stands on their profile. */
const ReleaseLine = ({ release }: { release: FanRelease }) => {
  if (release.leftAlone) {
    return (
      <li className="text-white/45">
        <span className="text-white/70">{release.title}</span> — skipped, they were left alone.
      </li>
    );
  }
  if (!release.liked && !release.reposted) {
    return (
      <li className="text-white/45">
        <span className="text-white/70">{release.title}</span> — didn&apos;t go through
        {release.error ? ` (${release.error})` : ""}. It&apos;s retried on the next pass.
      </li>
    );
  }
  if (release.removedAt) {
    return (
      <li className="text-white/45">
        <span className="text-white/70">{release.title}</span> — taken back off on{" "}
        {date(release.removedAt)}, as the song&apos;s settings asked.
      </li>
    );
  }
  const undone =
    (release.liked && release.likedNow === false) ||
    (release.reposted && release.repostedNow === false);
  return (
    <li className="text-white/70">
      <span className="text-white/85">{release.title}</span>
      <span className="ml-2 inline-flex gap-3 text-xs">
        {release.liked && (
          <span>
            Liked <Check on={release.likedNow} />
          </span>
        )}
        {release.reposted && (
          <span>
            Reposted <Check on={release.repostedNow} />
          </span>
        )}
      </span>
      <span className="block text-xs text-white/40">
        {undone
          ? "They've removed some of it by hand since."
          : release.removeAfter
            ? `Comes off automatically on ${date(release.removeAfter)}.`
            : "Stays on their profile."}
      </span>
    </li>
  );
};

const FanCard = ({ fan, rules }: { fan: Fan; rules: FansPayload["rules"] }) => {
  const [open, setOpen] = useState(false);
  const songs = songsOf(fan);
  const known = songs.filter((s) => s.likesNow !== null);
  const kept = known.filter((s) => s.likesNow).length;
  const signals = engagement(fan);
  const where = fan.location || (fan.downloadCountry ? countryName(fan.downloadCountry) : null);

  return (
    <div className={clsx("rounded-2xl border border-white/10 bg-white/[0.04]", fan.gone && "opacity-60")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <Avatar url={fan.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 truncate font-medium text-white/90">{fan.username}</span>
            {fan.isYou && <Pill tone="purple">You</Pill>}
            {fan.gone && <Pill tone="gray">Account deleted</Pill>}
            {!fan.isYou && fan.followsYou === true && <Pill tone="green">Follows you</Pill>}
            {!fan.isYou && fan.followsYou === false && (
              <Pill tone="red">
                Unfollowed{fan.unfollowedSince ? ` ${date(fan.unfollowedSince)}` : ""}
              </Pill>
            )}
            {fan.saved?.status === "ready" && <Pill tone="green">Gets your releases</Pill>}
            {fan.saved?.status === "left_alone" && <Pill tone="gray">Left alone</Pill>}
          </div>

          <p className="mt-0.5 text-xs text-white/50">
            {fan.followers !== null ? (
              <>
                <span className="text-white/75">{compact(fan.followers)}</span> followers ·{" "}
                <span className="text-white/75">{compact(fan.following ?? 0)}</span> following ·{" "}
                <span className="text-white/75">{fan.uploads ?? 0}</span> uploads
              </>
            ) : (
              "Profile not checked yet"
            )}
            {where ? ` · ${where}` : ""}
          </p>

          <p className="mt-1.5 text-xs text-white/60">
            {fan.downloads.length} download{fan.downloads.length === 1 ? "" : "s"}
            {songs.length !== fan.downloads.length ? ` of ${songs.length} songs` : ""}
            {known.length > 0 && ` · still likes ${kept} of ${known.length}`}
            {fan.downloads[0] && ` · last ${ago(fan.downloads[0].at)}`}
          </p>
        </div>

        {!fan.isYou && (
          <div className="flex shrink-0 flex-col items-end gap-1" title={signals.map((s) => `${s.on ? "✓" : "✕"} ${s.label}`).join("\n")}>
            <div className="flex gap-1">
              {signals.map((s) => (
                <span
                  key={s.label}
                  className={clsx("h-2 w-2 rounded-full", s.on ? "bg-purple-400" : "bg-white/10")}
                />
              ))}
            </div>
            <span className="text-[10px] text-white/35">{open ? "Less" : "More"}</span>
          </div>
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/5 px-4 pb-4 pt-3 text-sm">
          {fan.profileUrl && (
            <a
              href={fan.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-purple-300 underline decoration-purple-300/30 underline-offset-2 hover:decoration-purple-300"
            >
              Open their SoundCloud ↗
            </a>
          )}

          {!fan.isYou && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
                Engagement
              </p>
              <ul className="grid grid-cols-2 gap-1 text-xs">
                {signals.map((s) => (
                  <li key={s.label} className={s.on ? "text-white/80" : "text-white/35"}>
                    {s.on ? "✓" : "✕"} {s.label}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-white/40">
                First seen {date(fan.firstSeen)}.
              </p>
            </div>
          )}

          {fan.downloads.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
                Downloads
              </p>
              <ul className="space-y-1">
                {fan.downloads.map((d, i) => (
                  <li key={`${d.slug}-${d.at}-${i}`} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-white/80">{d.title}</span>
                    <span className="shrink-0 text-xs text-white/45">
                      Liked <Check on={d.likesNow} /> · {date(d.at)}
                    </span>
                  </li>
                ))}
              </ul>
              {known.length > kept && (
                <p className="mt-1.5 text-xs text-white/40">
                  A ✕ means they liked it to unlock the download and have since unliked it.
                </p>
              )}
            </div>
          )}

          {fan.saved && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
                Your releases on their profile
              </p>
              {fan.saved.status === "ended" ? (
                <p className="text-white/60">{endedText(fan)}</p>
              ) : (
                <>
                  {fan.saved.status === "left_alone" && (
                    <p className="mb-1.5 text-white/60">{leaveAloneText(fan, rules)} Releases skip them.</p>
                  )}
                  <ul className="space-y-1.5">
                    {fan.releases.map((r) => (
                      <ReleaseLine key={r.slug} release={r} />
                    ))}
                    {!fan.releases.length && (
                      <li className="text-xs text-white/40">
                        No releases sent yet.
                        {fan.saved.status === "ready" ? " Your next one will be the first." : ""}
                      </li>
                    )}
                  </ul>
                  <p className="mt-1.5 text-xs text-white/40">
                    Saved {date(fan.saved.savedAt)}.{" "}
                    {!fan.saved.lastCheckedAt || fan.saved.lastCheckedAt === fan.saved.savedAt
                      ? "Connection not checked yet — it's tested within a day of saving."
                      : `Connection working — last checked ${ago(fan.saved.lastCheckedAt)}.`}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** The old Downloads tab, as a strip: newest downloads, refreshed every few seconds. */
const LatestDownloads = ({ token, fans }: { token: string; fans: Fan[] }) => {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/downloads?key=${encodeURIComponent(token)}&limit=8`, {
          cache: "no-store"
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setRows(data.recent || []);
        setTotal(data.total ?? null);
      } catch {
        /* next poll retries */
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token]);

  const avatars = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const fan of fans) {
      if (fan.profileUrl) map.set(normalUrl(fan.profileUrl), fan.avatarUrl);
      map.set(`user:${fan.username.toLowerCase()}`, fan.avatarUrl);
    }
    return map;
  }, [fans]);

  return (
    <Section
      title="Latest downloads"
      note={
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live{total !== null ? ` · ${total.toLocaleString()} all time` : ""}
        </span>
      }
    >
      {rows.length ? (
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.03]">
          {rows.map((row, i) => (
            <li key={`${row.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar
                size={28}
                url={
                  (row.profileUrl && avatars.get(normalUrl(row.profileUrl))) ||
                  (row.username && avatars.get(`user:${row.username.toLowerCase()}`)) ||
                  null
                }
              />
              <p className="min-w-0 flex-1 truncate text-sm text-white/70">
                <span className="text-white/90">{row.username || "Someone without SoundCloud"}</span>{" "}
                downloaded <span className="text-white/90">{row.title}</span>
              </p>
              <span className="shrink-0 text-xs text-white/40">{row.at ? ago(row.at) : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No downloads yet.</Empty>
      )}
    </Section>
  );
};

export default function FansTab({ token }: { token: string }) {
  const [data, setData] = useState<FansPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/fans?key=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load your fans.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your fans.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const fans = useMemo(() => (data?.fans || []).filter((f) => !f.isYou), [data]);

  const counts = useMemo(() => {
    const songs = fans.flatMap((f) => songsOf(f).filter((s) => s.likesNow !== null));
    const checked = fans.filter((f) => f.followsYou !== null);
    return {
      all: fans.length,
      follows: fans.filter((f) => f.followsYou === true).length,
      followChecked: checked.length,
      unfollowed: fans.filter((f) => f.followsYou === false).length,
      repeat: fans.filter((f) => songsOf(f).length >= 2).length,
      ready: fans.filter((f) => f.saved?.status === "ready").length,
      left_alone: fans.filter((f) => f.saved?.status === "left_alone").length,
      likesKept: songs.filter((s) => s.likesNow).length,
      likesKnown: songs.length,
      downloads: (data?.fans || []).reduce((n, f) => n + f.downloads.length, 0) + (data?.anonymousDownloads || 0)
    };
  }, [fans, data]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = fans.filter((f) => {
      if (q && !f.username.toLowerCase().includes(q)) return false;
      switch (filter) {
        case "follows":
          return f.followsYou === true;
        case "unfollowed":
          return f.followsYou === false;
        case "repeat":
          return songsOf(f).length >= 2;
        case "ready":
          return f.saved?.status === "ready";
        case "left_alone":
          return f.saved?.status === "left_alone";
        default:
          return true;
      }
    });
    const by: Record<SortKey, (a: Fan, b: Fan) => number> = {
      recent: (a, b) => b.lastSeen.localeCompare(a.lastSeen),
      engaged: (a, b) => score(b) - score(a) || b.downloads.length - a.downloads.length,
      downloads: (a, b) => b.downloads.length - a.downloads.length || b.lastSeen.localeCompare(a.lastSeen),
      followers: (a, b) => (b.followers ?? -1) - (a.followers ?? -1)
    };
    return [...matches].sort(by[sort]);
  }, [fans, filter, sort, query]);

  useEffect(() => setShown(PAGE), [filter, sort, query]);

  const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

  return (
    <div className="space-y-8">
      <p className="text-center text-sm text-white/60">
        Everyone who&apos;s downloaded from you — who they are on SoundCloud, and how they&apos;ve
        stuck with you since.
      </p>

      {error && <Status kind="critical">{error}</Status>}
      {data?.liveError && <Status kind="warning">{data.liveError}</Status>}

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Fans" value={counts.all.toLocaleString()} sub={`${counts.downloads.toLocaleString()} downloads`} />
          <StatTile
            label="Still follow you"
            value={pct(counts.follows, counts.followChecked)}
            sub={`${counts.follows} of ${counts.followChecked}`}
          />
          <StatTile
            label="Kept their likes"
            value={pct(counts.likesKept, counts.likesKnown)}
            sub={`${counts.likesKept} of ${counts.likesKnown} songs`}
          />
          <StatTile
            label="Get your next release"
            value={counts.ready}
            sub={counts.left_alone ? `${counts.left_alone} left alone` : "saved fans"}
          />
        </div>
      )}

      <LatestDownloads token={token} fans={data?.fans || []} />

      {!data && !error && <Empty>Checking SoundCloud…</Empty>}

      {data && (
        <Section
          title="Fans"
          note={
            <>
              Checked live {ago(data.checkedAt)}.{" "}
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="underline decoration-white/20 underline-offset-2 hover:text-white/70 disabled:opacity-50"
              >
                {loading ? "Checking…" : "Check again"}
              </button>
            </>
          }
        >
          <div className="-mt-1 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key} className="bg-[#1a1025]">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    filter === f.key ? "bg-purple-600 text-white" : "bg-white/5 text-white/50 hover:text-white/80"
                  )}
                >
                  {f.label} <span className="opacity-60">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/35">
              The four dots are engagement: follows you, kept their likes, downloaded 2+ songs, gets
              your releases. Releases leave alone anyone you follow, anyone with{" "}
              {data.rules.followers.toLocaleString()}+ followers, and anyone with {data.rules.uploads}+
              uploads.
            </p>
          </div>

          {list.length ? (
            <div className="space-y-3">
              {list.slice(0, shown).map((fan) => (
                <FanCard key={fan.key} fan={fan} rules={data.rules} />
              ))}
              {list.length > shown && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm text-white/60 hover:text-white/85"
                >
                  Show more ({list.length - shown} left)
                </button>
              )}
            </div>
          ) : (
            <Empty>Nobody matches that.</Empty>
          )}
          {data.anonymousDownloads > 0 && (
            <p className="text-center text-xs text-white/35">
              Plus {data.anonymousDownloads} download{data.anonymousDownloads === 1 ? "" : "s"} from
              people who didn&apos;t connect SoundCloud.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}
