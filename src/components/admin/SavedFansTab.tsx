"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { SavedFan, SavedFanRelease, SavedFansPayload } from "@/lib/savedFansTypes";
import { Empty, Section, StatTile, Status, compact } from "@/components/admin/statsCharts";

/**
 * The admin "Saved fans" tab: everyone who let a release like and repost from
 * their account, whether the next one will, and what's on their profile from
 * you right now — checked live on SoundCloud each time the tab opens.
 */

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "ready", label: "Get your next release" },
  { key: "left_alone", label: "Left alone" },
  { key: "ended", label: "No longer saved" }
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

const Check = ({ on }: { on: boolean | null }) =>
  on === null ? (
    <span className="text-white/30">?</span>
  ) : on ? (
    <span className="text-emerald-400">✓</span>
  ) : (
    <span className="text-white/30">✕</span>
  );

const leaveAloneText = (fan: SavedFan, rules: SavedFansPayload["rules"]) => {
  switch (fan.leaveAloneReason) {
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

const endedText = (fan: SavedFan) => {
  const when = fan.endedAt ? date(fan.endedAt) : "";
  switch (fan.endedReason) {
    case "fan":
      return `Turned it off themselves on ${when}. They won't be saved again.`;
    case "token_invalid":
      return `SoundCloud stopped letting us in on ${when} (they may have disconnected the app). They're saved again automatically if they download again.`;
    case "admin":
      return `Removed by you on ${when}.`;
    default:
      return `Ended on ${when}.`;
  }
};

/** One release, as it stands on their profile. */
const ReleaseLine = ({ release }: { release: SavedFanRelease }) => {
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

const FanCard = ({ fan, rules }: { fan: SavedFan; rules: SavedFansPayload["rules"] }) => {
  const badge =
    fan.status === "ready"
      ? { text: "Gets your next release", cls: "bg-emerald-500/15 text-emerald-300" }
      : fan.status === "left_alone"
        ? { text: "Left alone", cls: "bg-white/10 text-white/60" }
        : { text: "No longer saved", cls: "bg-rose-500/15 text-rose-300" };
  const neverChecked = !fan.lastCheckedAt || fan.lastCheckedAt === fan.savedAt;

  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-white/[0.04] p-4",
        fan.status === "ended" && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        {fan.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fan.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {fan.profileUrl ? (
              <a
                href={fan.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-white/90 underline decoration-white/20 underline-offset-2 hover:decoration-white/60"
              >
                {fan.username}
              </a>
            ) : (
              <span className="truncate font-medium text-white/90">{fan.username}</span>
            )}
            <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-medium", badge.cls)}>
              {badge.text}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/45">
            Saved {date(fan.savedAt)}
            {fan.fromSong ? ` when they downloaded ${fan.fromSong}` : ""}
          </p>
          {fan.followers !== null && (
            <p className="mt-1 text-xs text-white/55">
              {compact(fan.followers)} followers · {fan.uploads} uploads ·{" "}
              {fan.followsYou === null ? "" : fan.followsYou ? "follows you" : "doesn't follow you anymore"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {fan.status === "left_alone" && (
          <p className="text-white/60">{leaveAloneText(fan, rules)} Releases skip them.</p>
        )}
        {fan.status === "ended" ? (
          <p className="text-white/60">{endedText(fan)}</p>
        ) : (
          <p className="text-xs text-white/45">
            {neverChecked
              ? "Connection not checked yet — it's tested within a day of saving."
              : `Connection working — last checked ${ago(fan.lastCheckedAt!)}.`}
          </p>
        )}

        {fan.status !== "ended" && (
          <div className="rounded-xl bg-black/20 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
              On their profile from you
            </p>
            <ul className="space-y-1.5">
              {fan.fromSong && (
                <li className="text-white/70">
                  <span className="text-white/85">{fan.fromSong}</span>
                  <span className="ml-2 text-xs">
                    Liked <Check on={fan.likesDownloadedSong} />
                  </span>
                  <span className="block text-xs text-white/40">
                    {fan.likesDownloadedSong === false
                      ? "They liked it to unlock the download and have since unliked it."
                      : "Their own like, from unlocking the download."}
                  </span>
                </li>
              )}
              {fan.releases.map((release) => (
                <ReleaseLine key={release.slug} release={release} />
              ))}
              {!fan.releases.length && (
                <li className="text-xs text-white/40">
                  No releases sent yet.
                  {fan.status === "ready" ? " Your next one will be the first." : ""}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default function SavedFansTab({ token }: { token: string }) {
  const [data, setData] = useState<SavedFansPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/fans?key=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load your saved fans.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your saved fans.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const fans = data?.fans || [];
    return {
      all: fans.length,
      ready: fans.filter((f) => f.status === "ready").length,
      left_alone: fans.filter((f) => f.status === "left_alone").length,
      ended: fans.filter((f) => f.status === "ended").length
    };
  }, [data]);

  const shown = (data?.fans || []).filter((f) => filter === "all" || f.status === filter);

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <p className="text-sm text-white/60">
          Fans who agreed, when they downloaded, to let your new releases like and repost from their
          SoundCloud. Big accounts and people you follow are never touched.
        </p>
        {data && (
          <p className="text-xs text-white/35">
            Left alone automatically: anyone you follow, anyone with{" "}
            {data.rules.followers.toLocaleString()}+ followers, and anyone with {data.rules.uploads}+
            uploads. Checked live on SoundCloud {ago(data.checkedAt)}.{" "}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="underline decoration-white/20 underline-offset-2 hover:text-white/70 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Check again"}
            </button>
          </p>
        )}
      </div>

      {error && <Status kind="critical">{error}</Status>}
      {data?.liveError && <Status kind="warning">{data.liveError}</Status>}
      {!data && !error && <Empty>Checking SoundCloud…</Empty>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Get your next release" value={counts.ready} />
            <StatTile label="Left alone" value={counts.left_alone} />
            <StatTile label="No longer saved" value={counts.ended} />
          </div>

          <Section title="Saved fans">
            <div className="-mt-1 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    filter === f.key
                      ? "bg-purple-600 text-white"
                      : "bg-white/5 text-white/50 hover:text-white/80"
                  )}
                >
                  {f.label} <span className="opacity-60">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            {shown.length ? (
              <div className="space-y-3">
                {shown.map((fan) => (
                  <FanCard key={fan.id} fan={fan} rules={data.rules} />
                ))}
              </div>
            ) : (
              <Empty>Nobody here yet.</Empty>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
