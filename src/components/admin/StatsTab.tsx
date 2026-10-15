"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { StatsFanState, StatsPayload } from "@/lib/statsTypes";
import {
  BarRow,
  ChartCard,
  ColumnChart,
  DataTable,
  Empty,
  Funnel,
  HBars,
  Heatmap,
  LineChart,
  Section,
  Sparkline,
  StatTile,
  Status,
  VIZ,
  compact,
  pct
} from "@/components/admin/statsCharts";

/**
 * The admin Stats tab.
 *
 * One request brings back every raw row (see lib/statsReport.ts); everything
 * here is sliced in the browser, so the range and song pickers at the top
 * re-cut every number on the page instantly and they always agree with each
 * other. Live tables are re-read every minute; SoundCloud's side comes from
 * the daily snapshot, with a button to take one now.
 */

const DAY = 86_400_000;
const RANGES = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: 0 }
] as const;

type RangeKey = (typeof RANGES)[number]["key"];
type Resolved = Exclude<StatsFanState, { unresolvedSince: string }>;

/** Local calendar day — the artist reads dates in their own timezone. */
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const daysBetween = (from: number, to: number) => {
  const out: string[] = [];
  for (let t = startOfDay(from); t <= to; t += DAY) {
    const key = dayKey(t);
    if (out[out.length - 1] !== key) out.push(key);
  }
  return out;
};
const shortDate = (ms: number | string) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const resolved = (state: StatsFanState | null | undefined): state is Resolved =>
  Boolean(state && !("unresolvedSince" in state));

let regionNames: Intl.DisplayNames | null = null;
const countryName = (code: string) => {
  try {
    regionNames = regionNames || new Intl.DisplayNames(undefined, { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
};
const flag = (code: string) =>
  /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "";
const sourceLabel = (source: string) =>
  source.startsWith("utm:") ? `${source.slice(4)} (tagged link)` : source;

/** Top N rows, with the tail folded into one "Other" row. */
const topWithOther = (counts: Map<string, number>, n: number, label: (k: string) => BarRow["label"]): BarRow[] => {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const rows: BarRow[] = sorted.slice(0, n).map(([k, v]) => ({ key: k, label: label(k), value: v }));
  const rest = sorted.slice(n).reduce((sum, [, v]) => sum + v, 0);
  if (rest) rows.push({ key: "__other", label: `Other (${sorted.length - n})`, value: rest });
  return rows;
};

const FanLink = ({ url, name }: { url: string | null; name: string }) =>
  url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-white/85 underline decoration-white/20 underline-offset-2 hover:decoration-white/60">
      {name}
    </a>
  ) : (
    <span className="text-white/70">{name}</span>
  );

export default function StatsTab({ token }: { token: string }) {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("30");
  const [song, setSong] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats?key=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load stats.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load stats.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Live tables move all day; a minute is plenty and cheap.
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  /**
   * Pulls fresh numbers from SoundCloud, then redraws. `auto` is the tab
   * doing it on its own when opened; the server skips that if a refresh
   * finished in the last two minutes, and an automatic run only speaks up
   * when it fails.
   */
  const refreshSoundcloud = useCallback(
    async (auto = false) => {
      setRefreshing(true);
      if (!auto) setRefreshNote(null);
      try {
        const res = await fetch(
          `/api/admin/stats?key=${encodeURIComponent(token)}${auto ? "&auto=1" : ""}`,
          { method: "POST" }
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Refresh failed.");
        if (!auto) {
          setRefreshNote(
            `Checked ${body.fans} fans on SoundCloud${body.partial ? " (ran out of time — the rest keep yesterday's answer)" : ""}.`
          );
        }
        if (!body.skipped) await load();
      } catch (e) {
        setRefreshNote(e instanceof Error ? e.message : "Refresh failed.");
      } finally {
        setRefreshing(false);
      }
    },
    [token, load]
  );

  // Every time the tab is opened or the page is reloaded: show what's stored
  // straight away (the first load above), and pull SoundCloud in behind it.
  useEffect(() => {
    void refreshSoundcloud(true);
  }, [refreshSoundcloud]);

  const view = useMemo(() => (data ? derive(data, range, song) : null), [data, range, song]);

  if (!data) {
    return (
      <div className="py-16 text-center text-sm text-white/50">
        {error ? <span className="text-rose-300">{error}</span> : "Crunching your numbers…"}
      </div>
    );
  }
  if (!view) return null;

  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() || "";
  const prevLabel = range === "all" ? "" : `previous ${rangeLabel}`;

  return (
    <div className={clsx("space-y-10 transition-opacity", loading && "opacity-90")}>
      {/* Filters — one row, scoping everything below. */}
      <div className="sticky top-0 z-20 -mx-2 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#120d1b]/90 px-3 py-2.5 backdrop-blur">
        <div className="flex rounded-xl bg-white/5 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                range === r.key ? "bg-purple-600 text-white" : "text-white/50 hover:text-white/85"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <select
          value={song}
          onChange={(e) => setSong(e.target.value)}
          className="max-w-[260px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/85 focus:border-purple-400/60 focus:outline-none"
        >
          <option value="all">All songs</option>
          {data.tracks.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-white/45">
          <span>
            SoundCloud data{" "}
            {data.snapshot ? `refreshed ${ago(data.snapshot.takenAt)}` : "not collected yet"}
            {data.snapshot?.partial && " (partial)"}
          </span>
          <button
            type="button"
            onClick={() => void refreshSoundcloud()}
            disabled={refreshing}
            className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white/80 transition hover:bg-white/15 disabled:opacity-50"
          >
            {refreshing ? "Updating from SoundCloud…" : "Refresh now"}
          </button>
        </div>
      </div>

      {(refreshNote || data.missing.length > 0) && (
        <div className="space-y-2">
          {refreshNote && <p className="rounded-xl bg-white/5 px-4 py-2.5 text-xs text-white/70">{refreshNote}</p>}
          {data.missing.length > 0 && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
              Not available yet: {data.missing.join(", ")}. Run the SQL in docs/ADMIN_STATS_SETUP.md — the rest of the page works without it.
            </p>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- */}
      <Section title="Headline" note={`${view.from ? shortDate(view.from) : ""} – today`}>
        <div className="grid gap-3 md:grid-cols-[1.3fr_2fr]">
          <StatTile
            hero
            label={`Downloads, ${rangeLabel}`}
            value={view.downloads.length.toLocaleString()}
            delta={prevLabel ? { value: view.downloads.length - view.prevDownloads, vs: prevLabel } : null}
            sub={`${(view.downloads.length / Math.max(1, view.dayKeys.length)).toFixed(1)} a day on average`}
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              label="New fans"
              value={view.newFans.toLocaleString()}
              delta={prevLabel ? { value: view.newFans - view.prevNewFans, vs: prevLabel } : null}
              sub="first download ever"
            />
            <StatTile
              label="Repeat downloads"
              value={pct(view.repeatDownloads, view.downloads.length)}
              sub={`${view.repeatDownloads} from fans who'd been before`}
            />
            <StatTile
              label="Still following you"
              value={pct(view.retention.following, view.retention.checked)}
              sub={`${view.retention.following} of ${view.retention.checked} fans checked`}
            />
            <StatTile
              label="Still liking the song"
              value={pct(view.retention.liking, view.retention.likeChecked)}
              sub={`${view.retention.liking} of ${view.retention.likeChecked} downloads`}
            />
            <StatTile
              label="SoundCloud followers"
              value={data.artist.followers !== null ? data.artist.followers.toLocaleString() : "—"}
              delta={view.followerDelta !== null ? { value: view.followerDelta, vs: `start of range` } : null}
              sub={view.followerDelta === null ? "history builds daily" : undefined}
            />
            <StatTile
              label="Saved for releases"
              value={view.subs.active.toLocaleString()}
              sub={view.subs.eta ? `100 around ${view.subs.eta}` : "right now"}
            />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section title="Downloads over time">
        <ChartCard
          title="Downloads per day"
          subtitle="Columns are each day; the line is the 7-day average."
          table={
            <DataTable
              columns={[{ label: "Day" }, { label: "Downloads", align: "right" }, { label: "New fans", align: "right" }, { label: "7-day avg", align: "right" }]}
              rows={[...view.daily].reverse().map((d) => [d.label, d.value, d.newFans, (d.avg ?? 0).toFixed(1)])}
            />
          }
        >
          {view.downloadsAllTime ? (
            <ColumnChart points={view.daily} valueLabel="downloads" avgLabel="7-day average" />
          ) : (
            <Empty>No downloads yet.</Empty>
          )}
        </ChartCard>
        <ChartCard
          title="Fans over time"
          subtitle="Everyone who's ever downloaded, counted once."
          table={
            <DataTable
              columns={[{ label: "Day" }, { label: "Fans so far", align: "right" }]}
              rows={[...view.cumulative].reverse().map((p) => [shortDate(p.t), p.v])}
            />
          }
        >
          {view.cumulative.length > 1 ? (
            <LineChart series={[{ name: "Fans", color: VIZ.s1, points: view.cumulative }]} zeroBased={false} />
          ) : (
            <Empty>Not enough days yet.</Empty>
          )}
        </ChartCard>
        <ChartCard title="When fans download" subtitle="Day of the week × hour, in your local time — post when your fans are around.">
          <Heatmap grid={view.heatmap} />
          {view.peak && <p className="mt-3 text-xs text-white/60">Busiest slot: <span className="text-white">{view.peak}</span></p>}
        </ChartCard>
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section title="Songs" note="SoundCloud columns come from the daily snapshot">
        <ChartCard title="Downloads by song" subtitle={`In the last ${rangeLabel}.`}>
          <HBars rows={view.songs.filter((s) => s.downloads > 0).map((s) => ({ key: s.slug, label: s.title, value: s.downloads, note: pct(s.downloads, view.downloads.length) }))} />
        </ChartCard>
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="mb-1 text-sm font-semibold text-white/90">Every song, every number</h3>
          <p className="mb-4 text-xs text-white/45">
            Downloads and fans are for the selected range; &ldquo;live&rdquo; columns are since each song&rsquo;s first download. Plays Δ is the change across the range.
          </p>
          <DataTable
            maxHeight={520}
            columns={[
              { label: "Song" },
              { label: "Trend" },
              { label: "Downloads", align: "right" },
              { label: "Fans", align: "right" },
              { label: "Last 7d", align: "right" },
              { label: "First week", align: "right" },
              { label: "Per day live", align: "right" },
              { label: "Days live", align: "right" },
              { label: "Plays", align: "right" },
              { label: "Plays Δ", align: "right" },
              { label: "Likes", align: "right" },
              { label: "Reposts", align: "right" },
              { label: "Comments", align: "right" },
              { label: "Plays per dl", align: "right" },
              { label: "Still following", align: "right" },
              { label: "Still liking", align: "right" }
            ]}
            rows={view.songs.map((s) => [
              <span key="t" className="block max-w-[220px] truncate" title={s.title}>{s.title}</span>,
              <Sparkline key="s" values={s.spark} />,
              s.downloads,
              s.fans,
              s.last7,
              s.firstWeek,
              s.perDay.toFixed(2),
              s.daysLive,
              s.sc ? compact(s.sc.plays) : "—",
              s.playsDelta !== null ? `${s.playsDelta >= 0 ? "+" : ""}${compact(s.playsDelta)}` : "—",
              s.sc ? compact(s.sc.likes) : "—",
              s.sc ? compact(s.sc.reposts) : "—",
              s.sc ? compact(s.sc.comments) : "—",
              s.sc && s.allDownloads ? (s.sc.plays / s.allDownloads).toFixed(0) : "—",
              pct(s.following, s.followChecked),
              pct(s.liking, s.likeChecked)
            ])}
          />
        </section>
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section
        title="The gate, step by step"
        note={data.events.since ? `Tracking since ${shortDate(data.events.since)}` : "Starts recording after this deploy"}
      >
        {data.events.rows.length === 0 ? (
          <Empty>
            The step-by-step log starts the moment this version is live: page views, Connect presses, unlocks and
            every download&rsquo;s gate state. Nothing before that can be reconstructed — the old site didn&rsquo;t record it.
          </Empty>
        ) : (
          <>
            <ChartCard
              title="Funnel"
              subtitle="Unique visitors at each step. Where the biggest drop is, that's the step to fix."
              table={
                <DataTable
                  columns={[{ label: "Song" }, { label: "Visitors", align: "right" }, { label: "Pressed connect", align: "right" }, { label: "Connected", align: "right" }, { label: "Unlocked", align: "right" }, { label: "Downloaded", align: "right" }, { label: "Conversion", align: "right" }]}
                  rows={view.funnelBySong.map((f) => [f.title, f.visitors, f.connect, f.connected, f.unlocked, f.downloaded, pct(f.downloaded, f.visitors)])}
                />
              }
            >
              <Funnel
                steps={[
                  { label: "Visited a gate", value: view.funnel.visitors, hint: `${view.funnel.views} page views` },
                  { label: "Pressed connect", value: view.funnel.connect },
                  { label: "Connected SoundCloud", value: view.funnel.connected },
                  { label: "Unlocked", value: view.funnel.unlocked },
                  { label: "Downloaded", value: view.funnel.downloaded }
                ]}
              />
              {view.funnel.manual > 0 && (
                <p className="mt-3 text-xs text-white/50">
                  {view.funnel.manual} visitor{view.funnel.manual === 1 ? "" : "s"} took the manual &ldquo;open SoundCloud yourself&rdquo; route instead — that route is on trust.
                </p>
              )}
            </ChartCard>
            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard title="Where visitors come from" subtitle="Add ?utm_source=instagram (etc.) to links you post — in-app browsers often hide the rest.">
                <HBars rows={view.sources} />
              </ChartCard>
              <ChartCard title="Visitors by country">
                <HBars rows={view.countries} />
              </ChartCard>
            </div>
          </>
        )}
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section title="Gate integrity" note="Who got through without doing the gate, and who undid it after">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Downloads with no SoundCloud account" value={view.integrity.noAccount.length} sub="manual route or a bypass" />
          <StatTile label="Possible bypasses" value={view.integrity.bypass} sub={data.events.since ? "no connection, no manual route" : "logged from this deploy on"} />
          <StatTile label="No longer following" value={data.snapshot ? view.integrity.unfollowed.length : "—"} sub={data.snapshot ? `of ${view.retention.checked} fans checked` : "after the first refresh"} />
          <StatTile label="Accounts gone" value={data.snapshot ? view.integrity.gone : "—"} sub="deleted or renamed" />
        </div>
        {view.integrity.states.length > 0 && (
          <ChartCard title="How each download got through" subtitle="What the server could see at the moment it handed out the file.">
            <ul className="space-y-2 text-xs">
              {view.integrity.states.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <Status kind={s.kind}>{s.label}</Status>
                  <span className="tabular-nums text-white/70">
                    {s.value} <span className="text-white/35">({pct(s.value, view.integrity.stateTotal)})</span>
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Downloaded, then stopped following" subtitle="As of the last SoundCloud refresh.">
            <DataTable
              columns={[{ label: "Fan" }, { label: "Songs" }, { label: "First download" }, { label: "Not following since" }]}
              rows={view.integrity.unfollowed.map((u) => [
                <FanLink key="f" url={u.url} name={u.name} />,
                u.songs,
                shortDate(u.first),
                u.since ? shortDate(u.since) : "—"
              ])}
            />
          </ChartCard>
          <ChartCard title="Downloaded, then unliked the song">
            <DataTable
              columns={[{ label: "Fan" }, { label: "Song" }, { label: "Downloaded" }, { label: "Not liking since" }]}
              rows={view.integrity.unliked.map((u) => [
                <FanLink key="f" url={u.url} name={u.name} />,
                u.song,
                shortDate(u.at),
                u.since ? shortDate(u.since) : "—"
              ])}
            />
          </ChartCard>
        </div>
        {view.integrity.noAccount.length > 0 && (
          <ChartCard title="Downloads with no SoundCloud account">
            <DataTable
              columns={[{ label: "When" }, { label: "Song" }]}
              rows={view.integrity.noAccount.map((d) => [new Date(d.at).toLocaleString(), d.song])}
            />
          </ChartCard>
        )}
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section title="Fans" note="Follower counts from the last SoundCloud refresh">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Fans in range" value={view.fans.count} />
          {/* Follower counts only exist once a refresh has looked the fans up;
              before that "0" would be a claim, not an absence. */}
          <StatTile label="Combined reach" value={data.snapshot ? compact(view.fans.reach) : "—"} sub={data.snapshot ? "their followers, added up" : "after the first refresh"} />
          <StatTile label="Typical fan's followers" value={data.snapshot ? compact(view.fans.median) : "—"} sub="median" />
          <StatTile label="Fans with 1K+ followers" value={data.snapshot ? view.fans.big : "—"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Biggest fans" subtitle="By their own follower count — a repost from them goes furthest.">
            <DataTable
              columns={[{ label: "Fan" }, { label: "Followers", align: "right" }, { label: "Downloads", align: "right" }, { label: "Follows you" }]}
              rows={view.fans.biggest.map((f) => [
                <FanLink key="f" url={f.url} name={f.name} />,
                compact(f.followers),
                f.downloads,
                f.follows === null ? "—" : f.follows ? <Status key="s" kind="good">Yes</Status> : <Status key="s" kind="critical">No</Status>
              ])}
            />
          </ChartCard>
          <ChartCard title="Most loyal" subtitle="Most songs downloaded.">
            <DataTable
              columns={[{ label: "Fan" }, { label: "Songs", align: "right" }, { label: "Downloads", align: "right" }, { label: "Since" }]}
              rows={view.fans.loyal.map((f) => [<FanLink key="f" url={f.url} name={f.name} />, f.songs, f.downloads, shortDate(f.first)])}
            />
          </ChartCard>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Songs fans download together" subtitle="Pairs of songs downloaded by the same fan.">
            <HBars rows={view.fans.pairs} />
          </ChartCard>
          <ChartCard title="Where fans say they're from" subtitle="From their SoundCloud profile, when they've filled it in.">
            <HBars rows={view.fans.profileCountries} />
          </ChartCard>
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section title="SoundCloud growth" note={data.history.length ? `${data.history.length} day${data.history.length === 1 ? "" : "s"} of history` : "Builds up one day at a time"}>
        <ChartCard
          title="Followers"
          subtitle="Your SoundCloud follower count, once a day."
          table={
            <DataTable
              columns={[{ label: "Day" }, { label: "Followers", align: "right" }, { label: "Change", align: "right" }]}
              rows={[...view.followerSeries].reverse().map((p, i, arr) => [shortDate(p.t), p.v.toLocaleString(), i < arr.length - 1 ? `${p.v - arr[i + 1].v >= 0 ? "+" : ""}${p.v - arr[i + 1].v}` : "—"])}
            />
          }
        >
          {view.followerSeries.length > 1 ? (
            <LineChart series={[{ name: "Followers", color: VIZ.s1, points: view.followerSeries }]} zeroBased={false} />
          ) : (
            <Empty>One point so far. The chart fills in as the daily refresh runs — come back tomorrow.</Empty>
          )}
        </ChartCard>
        {view.gateShare && (
          <p className="text-xs text-white/55">
            Over this range you gained <span className="text-white">{view.gateShare.gained}</span> followers and the gates brought in{" "}
            <span className="text-white">{view.gateShare.gateFans}</span> new fans who still follow you — roughly{" "}
            <span className="text-white">{pct(Math.min(view.gateShare.gateFans, view.gateShare.gained), view.gateShare.gained)}</span> of your growth.
          </p>
        )}
        <ChartCard title="Plays per song" subtitle="SoundCloud play count, once a day.">
          {view.playSeries.some((s) => s.points.length > 1) ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {view.playSeries.map((s) => (
                <div key={s.slug} className="rounded-xl border border-white/5 p-3">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-white/80">{s.title}</span>
                    <span className="shrink-0 tabular-nums text-white/55">{compact(s.points[s.points.length - 1]?.v ?? 0)}</span>
                  </div>
                  <LineChart series={[{ name: "Plays", color: VIZ.s1, points: s.points }]} height={110} zeroBased={false} />
                </div>
              ))}
            </div>
          ) : (
            <Empty>Needs at least two daily refreshes.</Empty>
          )}
        </ChartCard>
      </Section>

      {/* ---------------------------------------------------------- */}
      <Section title="Saved fans (release likes & reposts)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Saved right now" value={view.subs.active} />
          <StatTile label="Joined in range" value={view.subs.joined} />
          <StatTile label="Turned it off" value={view.subs.optedOut} sub="used the off switch" />
          <StatTile label="Connection died" value={view.subs.died} sub="revoked on SoundCloud" />
        </div>
        <ChartCard
          title="Saved fans over time"
          subtitle={view.subs.eta ? `At the last 30 days' pace (${view.subs.rate.toFixed(1)}/week) you reach 100 around ${view.subs.eta}. Dashed line is that forecast.` : "Forecast appears once fans start being saved."}
        >
          {view.subs.series.length > 1 ? (
            <LineChart
              series={[
                { name: "Saved fans", color: VIZ.s1, points: view.subs.series },
                ...(view.subs.projection.length > 1 ? [{ name: "Forecast to 100", color: VIZ.s2, points: view.subs.projection, projected: true }] : [])
              ]}
            />
          ) : (
            <Empty>No fans saved yet — the first one appears after the next connected download.</Empty>
          )}
        </ChartCard>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Releases sent">
            <DataTable
              columns={[{ label: "Song" }, { label: "Status" }, { label: "Fans", align: "right" }, { label: "Liked", align: "right" }, { label: "Reposted", align: "right" }, { label: "Failed", align: "right" }, { label: "Sent" }]}
              rows={data.subscribers.announcements.map((a) => [
                data.tracks.find((t) => t.slug === a.track)?.title || a.track,
                a.status,
                a.processed,
                a.liked,
                a.reposted,
                a.failed,
                shortDate(a.requestedAt)
              ])}
            />
          </ChartCard>
          <ChartCard title="Likes & reposts on saved accounts">
            <ul className="space-y-2 text-xs">
              {[
                ["Likes placed", data.subscribers.actions.liked],
                ["Reposts placed", data.subscribers.actions.reposted],
                ["Failed outright", data.subscribers.actions.failed],
                ["Waiting to be taken back off", data.subscribers.actions.removalsScheduled],
                ["Overdue for removal", data.subscribers.actions.removalsPending],
                ["Taken back off", data.subscribers.actions.removed],
                ["Couldn't be taken off", data.subscribers.actions.removalFailed]
              ].map(([label, value]) => (
                <li key={label as string} className="flex justify-between gap-3 border-b border-white/5 pb-1.5">
                  <span className="text-white/65">{label}</span>
                  <span className="tabular-nums text-white">{value as number}</span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      </Section>

      <p className="pb-6 text-center text-[11px] text-white/30">
        Generated {new Date(data.generatedAt).toLocaleString()} · your own account is left out of every fan number
      </p>
    </div>
  );
}

/* ================================================================== */
/* Everything the page shows, for one range and one song.             */
/* ================================================================== */

function derive(data: StatsPayload, range: RangeKey, song: string) {
  const now = Date.now();
  const rangeDays = RANGES.find((r) => r.key === range)?.days || 0;
  const songIndex = song === "all" ? -1 : data.tracks.findIndex((t) => t.slug === song);
  const matchSong = (i: number) => songIndex === -1 || i === songIndex;

  // Your own account is never a fan.
  const artistName = data.artist.username.toLowerCase();
  const isArtist = (fan: number) => {
    if (fan < 0) return false;
    const state = data.fanState[fan];
    if (resolved(state) && state.isArtist) return true;
    const f = data.fans[fan];
    return Boolean(
      (f.url && f.url.replace(/\/$/, "") === data.artist.profileUrl.replace(/\/$/, "")) ||
        (artistName && f.username?.toLowerCase() === artistName)
    );
  };

  const all = data.downloads.filter(([, t, f]) => matchSong(t) && !isArtist(f));
  const firstEver = all[0]?.[0] ?? now;
  const from = rangeDays ? startOfDay(now - (rangeDays - 1) * DAY) : startOfDay(firstEver);
  const prevFrom = from - (now - from);
  const inRange = (ms: number) => ms >= from;

  const downloads = all.filter(([t]) => inRange(t));
  const prevDownloads = all.filter(([t]) => t >= prevFrom && t < from).length;

  // First time each fan downloaded (in this song scope).
  const firstSeen = new Map<number, number>();
  for (const [t, , f] of all) if (f >= 0 && !firstSeen.has(f)) firstSeen.set(f, t);
  const newFans = [...firstSeen.values()].filter(inRange).length;
  const prevNewFans = [...firstSeen.values()].filter((t) => t >= prevFrom && t < from).length;
  const repeatDownloads = downloads.filter(([t, , f]) => f >= 0 && (firstSeen.get(f) ?? t) < t).length;

  // Daily columns with a trailing 7-day average.
  const dayKeys = daysBetween(from, now);
  const perDay = new Map<string, number>();
  const newPerDay = new Map<string, number>();
  for (const [t] of all) perDay.set(dayKey(t), (perDay.get(dayKey(t)) || 0) + 1);
  for (const t of firstSeen.values()) newPerDay.set(dayKey(t), (newPerDay.get(dayKey(t)) || 0) + 1);
  const allDayKeys = daysBetween(Math.min(from, firstEver), now);
  const avgByDay = new Map<string, number>();
  allDayKeys.forEach((key, i) => {
    const window = allDayKeys.slice(Math.max(0, i - 6), i + 1);
    avgByDay.set(key, window.reduce((s, k) => s + (perDay.get(k) || 0), 0) / window.length);
  });
  const daily = dayKeys.map((key) => ({
    key,
    label: new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    value: perDay.get(key) || 0,
    newFans: newPerDay.get(key) || 0,
    avg: avgByDay.get(key) || 0
  }));

  // Cumulative unique fans, drawn across the range.
  const cumulative: { t: number; v: number }[] = [];
  {
    let running = [...firstSeen.values()].filter((t) => t < from).length;
    for (const key of dayKeys) {
      running += newPerDay.get(key) || 0;
      cumulative.push({ t: Date.parse(`${key}T12:00:00`), v: running });
    }
  }

  // Heatmap, Monday-first, local time.
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const [t] of downloads) {
    const d = new Date(t);
    heatmap[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  let peak: string | null = null;
  {
    let best = 0;
    heatmap.forEach((row, d) =>
      row.forEach((v, h) => {
        if (v > best) {
          best = v;
          const hour = (x: number) => new Date(2000, 0, 1, x).toLocaleTimeString(undefined, { hour: "numeric" });
          peak = `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d]}, ${hour(h)}–${hour((h + 1) % 24)} (${v})`;
        }
      })
    );
  }

  // Retention among fans who downloaded in range.
  const fansInRange = new Set(downloads.map(([, , f]) => f).filter((f) => f >= 0));
  let following = 0;
  let checked = 0;
  for (const f of fansInRange) {
    const s = data.fanState[f];
    if (!resolved(s)) continue;
    checked++;
    if (s.followsArtist) following++;
  }
  const pairs = new Map<string, { fan: number; track: number; at: number }>();
  for (const [t, track, f] of downloads) {
    if (f < 0) continue;
    const key = `${f}:${track}`;
    if (!pairs.has(key)) pairs.set(key, { fan: f, track, at: t });
  }
  let liking = 0;
  let likeChecked = 0;
  for (const { fan, track } of pairs.values()) {
    const s = data.fanState[fan];
    const slug = data.tracks[track]?.slug;
    if (!resolved(s) || !slug || !(slug in s.likes)) continue;
    likeChecked++;
    if (s.likes[slug]) liking++;
  }

  // SoundCloud history, cut to the range.
  const historyInRange = data.history.filter((h) => Date.parse(`${h.day}T12:00:00`) >= from);
  const followerSeries = historyInRange.map((h) => ({ t: Date.parse(`${h.day}T12:00:00`), v: h.followers }));
  const followerDelta =
    followerSeries.length > 1 ? followerSeries[followerSeries.length - 1].v - followerSeries[0].v : null;

  // Per song.
  const latest = data.history[data.history.length - 1];
  const sparkDays = dayKeys.slice(-Math.min(dayKeys.length, 60));
  const songs = data.tracks
    .map((track, index) => {
      if (!matchSong(index)) return null;
      const rows = all.filter(([, t]) => t === index);
      const ranged = rows.filter(([t]) => inRange(t));
      const firstAt = rows[0]?.[0] ?? null;
      const daysLive = firstAt ? Math.max(1, Math.ceil((now - firstAt) / DAY)) : 0;
      const byDay = new Map<string, number>();
      for (const [t] of rows) byDay.set(dayKey(t), (byDay.get(dayKey(t)) || 0) + 1);
      const fansOf = new Set(ranged.map(([, , f]) => f).filter((f) => f >= 0));
      let fFollow = 0, fChecked = 0, fLike = 0, fLikeChecked = 0;
      for (const f of fansOf) {
        const s = data.fanState[f];
        if (!resolved(s)) continue;
        fChecked++;
        if (s.followsArtist) fFollow++;
        if (track.slug in s.likes) {
          fLikeChecked++;
          if (s.likes[track.slug]) fLike++;
        }
      }
      const sc = latest?.tracks[track.slug] || null;
      const firstInRange = historyInRange.find((h) => h.tracks[track.slug]);
      const playsDelta = sc && firstInRange && historyInRange.length > 1 ? sc.plays - firstInRange.tracks[track.slug].plays : null;
      return {
        slug: track.slug,
        title: track.title,
        downloads: ranged.length,
        allDownloads: rows.length,
        fans: fansOf.size,
        last7: rows.filter(([t]) => t >= now - 7 * DAY).length,
        firstWeek: firstAt ? rows.filter(([t]) => t < firstAt + 7 * DAY).length : 0,
        perDay: daysLive ? rows.length / daysLive : 0,
        daysLive,
        spark: sparkDays.map((k) => byDay.get(k) || 0),
        sc,
        playsDelta,
        following: fFollow,
        followChecked: fChecked,
        liking: fLike,
        likeChecked: fLikeChecked
      };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => b.downloads - a.downloads || b.allDownloads - a.allDownloads);

  // Gate events, cut to the range and song.
  const kindIndex = (k: string) => data.events.kinds.indexOf(k);
  const events = data.events.rows.filter(([t, track]) => inRange(t) && matchSong(track));
  const uniq = (kind: string, track?: number) => {
    const k = kindIndex(kind);
    const sessions = new Set<number>();
    let anonymous = 0;
    for (const [, tr, kk, s] of events) {
      if (kk !== k || (track !== undefined && tr !== track)) continue;
      if (s >= 0) sessions.add(s);
      else anonymous++;
    }
    return sessions.size + anonymous;
  };
  const count = (kind: string, track?: number) =>
    events.filter(([, tr, k]) => k === kindIndex(kind) && (track === undefined || tr === track)).length;
  const funnel = {
    views: count("view"),
    visitors: uniq("view"),
    connect: uniq("connect"),
    connected: uniq("connected"),
    unlocked: uniq("unlock"),
    downloaded: uniq("download"),
    manual: uniq("manual")
  };
  const funnelBySong = data.tracks
    .map((t, i) => ({
      title: t.title,
      visitors: uniq("view", i),
      connect: uniq("connect", i),
      connected: uniq("connected", i),
      unlocked: uniq("unlock", i),
      downloaded: uniq("download", i)
    }))
    .filter((f, i) => matchSong(i) && (f.visitors || f.downloaded))
    .sort((a, b) => b.visitors - a.visitors);

  const sourceCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  for (const [, , k, , c, src] of events) {
    if (k !== kindIndex("view")) continue;
    const label = src >= 0 ? data.events.sources[src] : "Direct / unknown";
    sourceCounts.set(label, (sourceCounts.get(label) || 0) + 1);
    if (c >= 0) countryCounts.set(data.events.countries[c], (countryCounts.get(data.events.countries[c]) || 0) + 1);
  }
  const sources = topWithOther(sourceCounts, 8, (k) => sourceLabel(k));
  const countries = topWithOther(countryCounts, 8, (k) => `${flag(k)} ${countryName(k)}`);

  // Integrity: how each logged download got through.
  const manualSessions = new Set(events.filter(([, , k]) => k === kindIndex("manual")).map(([, , , s]) => s).filter((s) => s >= 0));
  let unlockedN = 0, connectedOnly = 0, manualN = 0, bypass = 0;
  for (const [, , k, s, , , g] of events) {
    if (k !== kindIndex("download")) continue;
    const state = g >= 0 ? data.events.gates[g] : null;
    if (state === "unlocked") unlockedN++;
    else if (state === "connected_not_unlocked") connectedOnly++;
    else if (state === "no_connection") {
      if (s >= 0 && manualSessions.has(s)) manualN++;
      else bypass++;
    }
  }
  const stateTotal = unlockedN + connectedOnly + manualN + bypass;
  const states = stateTotal
    ? ([
        { label: "Did the gate (connected and unlocked)", value: unlockedN, kind: "good" },
        { label: "Took the manual route (on trust)", value: manualN, kind: "warning" },
        { label: "Connected, but follows never went through", value: connectedOnly, kind: "warning" },
        { label: "No connection, no manual route — possible bypass", value: bypass, kind: "critical" }
      ] as const).filter((s) => s.value > 0)
    : [];

  const fanName = (f: number) => {
    const s = data.fanState[f];
    return (resolved(s) && s.username) || data.fans[f].username || data.fans[f].url || "unknown";
  };
  const songsOf = new Map<number, Set<number>>();
  const downloadsOf = new Map<number, number>();
  for (const [, track, f] of downloads) {
    if (f < 0) continue;
    if (!songsOf.has(f)) songsOf.set(f, new Set());
    songsOf.get(f)!.add(track);
    downloadsOf.set(f, (downloadsOf.get(f) || 0) + 1);
  }
  const unfollowed = [...fansInRange]
    .filter((f) => resolved(data.fanState[f]) && !(data.fanState[f] as Resolved).followsArtist)
    .map((f) => ({
      url: data.fans[f].url,
      name: fanName(f),
      songs: [...(songsOf.get(f) || [])].map((t) => data.tracks[t]?.title).join(", "),
      first: firstSeen.get(f) || 0,
      since: (data.fanState[f] as Resolved).notFollowingSince
    }))
    .sort((a, b) => (b.since || "").localeCompare(a.since || ""));
  const unliked = [...pairs.values()]
    .filter(({ fan, track }) => {
      const s = data.fanState[fan];
      const slug = data.tracks[track]?.slug;
      return resolved(s) && slug && slug in s.likes && !s.likes[slug];
    })
    .map(({ fan, track, at }) => ({
      url: data.fans[fan].url,
      name: fanName(fan),
      song: data.tracks[track]?.title || "",
      at,
      since: (data.fanState[fan] as Resolved).notLikingSince[data.tracks[track].slug] || null
    }));
  const noAccount = downloads
    .filter(([, , f]) => f < 0)
    .map(([t, track]) => ({ at: t, song: data.tracks[track]?.title || "" }))
    .reverse();
  const gone = [...fansInRange].filter((f) => data.fanState[f] && !resolved(data.fanState[f])).length;

  // Fans.
  const fanFollowers = [...fansInRange]
    .map((f) => ({ f, s: data.fanState[f] }))
    .filter((x): x is { f: number; s: Resolved } => resolved(x.s));
  const reach = fanFollowers.reduce((sum, x) => sum + x.s.followers, 0);
  const biggest = [...fanFollowers]
    .sort((a, b) => b.s.followers - a.s.followers)
    .slice(0, 12)
    .map(({ f, s }) => ({ url: data.fans[f].url, name: fanName(f), followers: s.followers, downloads: downloadsOf.get(f) || 0, follows: s.followsArtist }));
  const loyal = [...fansInRange]
    .map((f) => ({ f, songs: songsOf.get(f)?.size || 0, downloads: downloadsOf.get(f) || 0 }))
    .sort((a, b) => b.songs - a.songs || b.downloads - a.downloads)
    .slice(0, 12)
    .map(({ f, songs: n, downloads: d }) => ({ url: data.fans[f].url, name: fanName(f), songs: n, downloads: d, first: firstSeen.get(f) || 0 }));
  const pairCounts = new Map<string, number>();
  for (const set of songsOf.values()) {
    const list = [...set].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const key = `${list[i]}|${list[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
  }
  const pairRows = topWithOther(pairCounts, 8, (k) => {
    const [a, b] = k.split("|").map(Number);
    return `${data.tracks[a]?.title} + ${data.tracks[b]?.title}`;
  }).filter((r) => r.key !== "__other");
  const profileCountryCounts = new Map<string, number>();
  for (const { s } of fanFollowers) if (s.country) profileCountryCounts.set(s.country, (profileCountryCounts.get(s.country) || 0) + 1);
  const profileCountries = topWithOther(profileCountryCounts, 8, (k) => k);

  // Followers gained vs fans the gate brought in who still follow.
  const gateShare =
    followerDelta !== null && followerDelta > 0
      ? {
          gained: followerDelta,
          gateFans: [...firstSeen.entries()].filter(([f, t]) => t >= Date.parse(`${historyInRange[0].day}T12:00:00`) && resolved(data.fanState[f]) && (data.fanState[f] as Resolved).followsArtist).length
        }
      : null;

  const playSeries = songs
    .filter((s) => s.sc)
    .slice(0, 8)
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      points: historyInRange.filter((h) => h.tracks[s.slug]).map((h) => ({ t: Date.parse(`${h.day}T12:00:00`), v: h.tracks[s.slug].plays }))
    }));

  // Saved fans: running total, and the forecast to 100.
  const subRows = data.subscribers.rows;
  const changes: [number, number][] = [];
  for (const r of subRows) {
    changes.push([Date.parse(r.createdAt), 1]);
    if (r.revokedAt) changes.push([Date.parse(r.revokedAt), -1]);
  }
  changes.sort((a, b) => a[0] - b[0]);
  const active = subRows.filter((r) => !r.revokedAt).length;
  const series: { t: number; v: number }[] = [];
  {
    let running = 0;
    for (const [t, d] of changes) {
      running += d;
      if (t >= from) series.push({ t, v: running });
    }
    if (series.length || active) series.push({ t: now, v: active });
    if (series.length === 1) series.unshift({ t: from, v: series[0].v });
  }
  const joined30 = subRows.filter((r) => Date.parse(r.createdAt) >= now - 30 * DAY).length;
  const left30 = subRows.filter((r) => r.revokedAt && Date.parse(r.revokedAt) >= now - 30 * DAY).length;
  const perDayNet = (joined30 - left30) / 30;
  const etaMs = active < 100 && perDayNet > 0 ? now + ((100 - active) / perDayNet) * DAY : null;
  const projection =
    etaMs && etaMs - now < 730 * DAY
      ? [
          { t: now, v: active },
          { t: etaMs, v: 100 }
        ]
      : [];

  return {
    from,
    dayKeys,
    downloads,
    downloadsAllTime: all.length,
    prevDownloads,
    newFans,
    prevNewFans,
    repeatDownloads,
    daily,
    cumulative,
    heatmap,
    peak: peak as string | null,
    retention: { following, checked, liking, likeChecked },
    followerSeries,
    followerDelta,
    songs,
    funnel,
    funnelBySong,
    sources,
    countries,
    integrity: { states, stateTotal, bypass, unfollowed, unliked, noAccount, gone },
    fans: {
      count: fansInRange.size,
      reach,
      median: median(fanFollowers.map((x) => x.s.followers)),
      big: fanFollowers.filter((x) => x.s.followers >= 1000).length,
      biggest,
      loyal,
      pairs: pairRows,
      profileCountries
    },
    gateShare,
    playSeries,
    subs: {
      active,
      joined: subRows.filter((r) => Date.parse(r.createdAt) >= from).length,
      optedOut: subRows.filter((r) => r.reason === "fan").length,
      died: subRows.filter((r) => r.reason === "token_invalid").length,
      series,
      projection,
      rate: perDayNet * 7,
      eta: etaMs ? new Date(etaMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null
    }
  };
}
