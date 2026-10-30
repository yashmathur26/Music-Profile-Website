"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { BoostEdit, BoostPerson, BoostState, SongBoost } from "@/lib/songBoostTypes";
import { Sparkline, compact } from "@/components/admin/statsCharts";

/**
 * One song, opened from its row in Live gates: SoundCloud's all-time numbers
 * for it, and its boost from fans — who it reached, what's on their profiles
 * right now, and the controls to change that after it has gone out: take
 * people out (one or everyone), slow the rest down, or keep it up longer.
 */

/** How long it stays up. null = for good. */
const KEEP_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: null, label: "Forever" }
];

/** Time between one fan and the next, randomised a little either way. */
const GAP_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: "10 sec" },
  { value: 30, label: "30 sec" },
  { value: 60, label: "1 min" },
  { value: 300, label: "5 min" },
  { value: 900, label: "15 min" },
  { value: 3600, label: "1 hour" }
];

/** How spread out the take-off is once the time is up. */
const REMOVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: "30 min" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
  { value: 1440, label: "1 day" }
];

const PREVIEW = 5;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? time(iso) : `${day(iso)}, ${time(iso)}`;
};

const plural = (n: number, word: string) => `${compact(n)} ${word}${n === 1 ? "" : "s"}`;

const STATE_LABEL: Record<BoostState, string> = {
  live: "Live",
  waiting: "Waiting",
  came_off: "Came off",
  taken_out: "Taken out",
  skipped: "Skipped",
  failed: "Didn't land",
  not_sent: "Not sent"
};

/** A row of pill buttons where exactly one is picked. */
function Pills<T>({
  options,
  value,
  onPick,
  busy
}: {
  options: { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
  busy?: boolean;
}) {
  return (
    <div className={clsx("flex flex-wrap gap-1.5", busy && "pointer-events-none opacity-60")}>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => option.value !== value && onPick(option.value)}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-medium transition",
            option.value === value
              ? "bg-white text-black"
              : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white/90"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const Avatar = ({ url, name }: { url: string | null; name: string }) =>
  url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/10 object-cover" loading="lazy" />
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/50">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );

const Stat = ({ label, value }: { label: string; value: number | null }) => (
  <div>
    <p className="text-2xl font-semibold tracking-tight text-white">
      {value === null ? "—" : compact(value)}
    </p>
    <p className="mt-0.5 text-[11px] text-white/45">{label}</p>
  </div>
);

/** Is it actually coming off right now, rather than already off? */
const comingOff = (p: BoostPerson) =>
  p.state === "taken_out" && (p.liked || p.reposted) && !p.removedAt;

function StatePill({ person }: { person: BoostPerson }) {
  const label = comingOff(person) ? "Coming off…" : STATE_LABEL[person.state];
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        person.state === "live" && "bg-emerald-500/15 text-emerald-300",
        person.state === "waiting" && "bg-purple-500/20 text-purple-200",
        person.state === "taken_out" && "bg-rose-500/15 text-rose-300",
        person.state === "failed" && "bg-amber-500/15 text-amber-200",
        ["came_off", "skipped", "not_sent"].includes(person.state) && "bg-white/[0.06] text-white/45"
      )}
    >
      {label}
    </span>
  );
}

/** ♥ ↻, lit when it's on their profile. Checked live where possible. */
function Marks({ person }: { person: BoostPerson }) {
  if (person.state !== "live" && !comingOff(person)) return null;
  const like = person.likedNow ?? person.liked;
  const repost = person.repostedNow ?? person.reposted;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className={like ? "text-rose-300" : "text-white/20"} title={like ? "Liked" : "Not liked"}>
        ♥
      </span>
      <span className={repost ? "text-sky-300" : "text-white/20"} title={repost ? "Reposted" : "Not reposted"}>
        ↻
      </span>
    </span>
  );
}

function PersonRow({
  person,
  open,
  onToggle,
  edit,
  busy
}: {
  person: BoostPerson;
  open: boolean;
  onToggle: () => void;
  edit: (body: BoostEdit) => Promise<void>;
  busy: boolean;
}) {
  const editable = ["live", "waiting", "taken_out", "not_sent"].includes(person.state);
  const keepValue = person.removeAfter && person.reachedAt
    // Floored: each fan's take-off is spread up to a day past the deadline.
    ? Math.floor((Date.parse(person.removeAfter) - Date.parse(person.reachedAt)) / 86_400_000)
    : null;

  const sub =
    person.state === "live"
      ? person.note || (person.removeAfter ? `Comes off ${day(person.removeAfter)}` : "Stays up")
      : person.state === "came_off" && person.removedAt
        ? `Came off ${day(person.removedAt)}`
        : person.note ||
          (person.followers !== null ? `${compact(person.followers)} followers` : null);

  return (
    <li className={clsx("rounded-xl transition", open ? "bg-white/[0.05]" : "hover:bg-white/[0.03]")}>
      <button
        type="button"
        onClick={editable ? onToggle : undefined}
        className={clsx("flex w-full items-center gap-3 px-3 py-2.5 text-left", !editable && "cursor-default")}
      >
        <Avatar url={person.avatarUrl} name={person.username} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white/90">{person.username}</p>
          {sub && <p className="truncate text-[11px] text-white/40">{sub}</p>}
        </div>
        <Marks person={person} />
        <StatePill person={person} />
        {editable && (
          <span className={clsx("text-xs text-white/30 transition", open && "rotate-90")} aria-hidden>
            ›
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-3 pl-[60px]">
              {person.state === "live" && (
                <div>
                  <p className="mb-1.5 text-[11px] text-white/45">Keep it up on their profile for</p>
                  <Pills
                    options={KEEP_OPTIONS}
                    value={person.removeAfter ? keepValue : null}
                    busy={busy}
                    onPick={(days) => edit({ action: "keep_for", days, ids: [person.id] })}
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {person.state === "taken_out" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => edit({ action: "put_back", ids: [person.id] })}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/15 disabled:opacity-50"
                  >
                    Put them back
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => edit({ action: "take_out", ids: [person.id] })}
                    className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    {person.state === "live" ? "Take it off now" : "Skip them"}
                  </button>
                )}
                {person.profileUrl && (
                  <a
                    href={person.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg px-3 py-1.5 text-xs text-white/45 transition hover:text-white/80"
                  >
                    Profile ↗
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function SongPanel({
  slug,
  token,
  onClose,
  onChanged
}: {
  slug: string;
  token: string;
  onClose: () => void;
  /** Something about the gate changed (its plan, its send), so its row should reload. */
  onChanged: () => void;
}) {
  const [data, setData] = useState<SongBoost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tracks/${encodeURIComponent(slug)}/boost`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load this song.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this song.");
    }
  }, [slug, token]);

  // Refresh while something is moving — a send going out, or people coming off.
  const moving =
    data?.boost.people.some((p) => p.state === "waiting" || comingOff(p)) ?? false;
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(timer);
  }, [moving, load]);

  // Once per open: the parent re-renders on its own polling, and re-running
  // this would capture "hidden" as the overflow to restore on close.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      clearTimeout(confirmTimer.current);
    };
  }, []);

  const edit = async (body: BoostEdit, message?: string) => {
    setBusy(body.action);
    try {
      const res = await fetch(`/api/admin/tracks/${encodeURIComponent(slug)}/boost`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "That didn't save.");
      setError(null);
      if (message) {
        setFlash(message);
        setTimeout(() => setFlash((f) => (f === message ? null : f)), 3500);
      }
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  };

  const people = data?.boost.people || [];
  const counts = useMemo(() => {
    const by = (s: BoostState) => people.filter((p) => p.state === s).length;
    const live = people.filter((p) => p.state === "live");
    return {
      live: live.length,
      liked: live.filter((p) => p.likedNow ?? p.liked).length,
      reposted: live.filter((p) => p.repostedNow ?? p.reposted).length,
      waiting: by("waiting"),
      takenOut: by("taken_out"),
      sendable: people.filter((p) => p.state !== "not_sent" && p.state !== "skipped").length
    };
  }, [people]);

  const plan = data?.boost.plan;
  const announcement = data?.boost.announcement;
  const sending = announcement?.status === "pending" || announcement?.status === "running";
  const neverSent = !announcement;
  const reached = counts.sendable - counts.waiting;
  const shown = showAll ? people : people.slice(0, PREVIEW);
  const canTakeAll = counts.live + counts.waiting > 0;

  // Fans who were reached together come off together, so the earliest live
  // deadline is the honest one to quote for "everyone".
  const nextOff = people
    .filter((p) => p.state === "live" && p.removeAfter)
    .map((p) => p.removeAfter!)
    .sort()[0];

  // Plays gained each day, not the running total, which draws as a flat line.
  const plays = (data?.history || []).slice(1).map((h, i) => Math.max(0, h.plays - data!.history[i].plays));
  const weekAgo = data?.history.find(
    (h) => Date.parse(h.day) >= Date.now() - 8 * 86_400_000
  );
  const playsThisWeek =
    data?.stats && weekAgo ? Math.max(0, data.stats.plays - weekAgo.plays) : null;

  const askTakeAll = () => {
    if (!confirmAll) {
      setConfirmAll(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmAll(false), 4000);
      return;
    }
    setConfirmAll(false);
    void edit({ action: "take_out" }, "Taking it off everyone — give it a few minutes.");
  };

  // Portalled to <body>: the admin tabs animate with transforms, and a
  // transformed ancestor would pin this "fixed" overlay to the tab instead
  // of the window.
  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={data?.song.title || "Song"}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#120e1a] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-4">
          {data?.song.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.song.artworkUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-lg bg-white/10" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-white">{data?.song.title || "Loading…"}</p>
            <p className="truncate text-xs text-white/40">
              /{slug}
              {data?.song.url && (
                <a href={data.song.url} target="_blank" rel="noreferrer" className="ml-2 hover:text-white/70">
                  SoundCloud ↗
                </a>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
          {error && (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
          )}

          {!data && !error && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          )}

          {data && (
            <>
              {/* All-time */}
              <section>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">All-time</p>
                <div className="grid grid-cols-4 gap-3">
                  <Stat label="Plays" value={data.stats?.plays ?? null} />
                  <Stat label="Likes" value={data.stats?.likes ?? null} />
                  <Stat label="Reposts" value={data.stats?.reposts ?? null} />
                  <Stat label="Comments" value={data.stats?.comments ?? null} />
                </div>
                {plays.length > 1 && (
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <p className="text-xs text-white/50">
                      {playsThisWeek !== null ? (
                        <>
                          <span className="font-medium text-white/85">+{compact(playsThisWeek)}</span> plays this week
                        </>
                      ) : (
                        "Plays over time"
                      )}
                    </p>
                    <Sparkline values={plays} width={110} height={24} />
                  </div>
                )}
                <p className="mt-3 text-xs text-white/40">
                  {plural(data.gate.views, "page view")} · {plural(data.gate.downloads, "download")} ·{" "}
                  {plural(data.gate.fans, "fan")}
                  {data.gate.firstDownloadAt && <> · since {day(data.gate.firstDownloadAt)}</>}
                </p>
              </section>

              {/* Boost */}
              {data.boost.configured && plan && (
                <section className="space-y-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                      Boost from fans
                    </p>
                    <p className="mt-2 text-sm text-white/80">
                      {neverSent
                        ? "Not sent yet — send it from the song's row."
                        : announcement?.status === "stopped"
                          ? `Stopped · reached ${reached} of ${counts.sendable}`
                          : sending
                            ? `Sending · ${reached} of ${counts.sendable} reached`
                            : `Sent ${announcement?.startedAt ? day(announcement.startedAt) : ""} · ${counts.live} live now`}
                    </p>
                    {sending && counts.sendable > 0 && (
                      <>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <motion.div
                            className="h-full rounded-full bg-purple-400"
                            animate={{ width: `${Math.round((reached / counts.sendable) * 100)}%` }}
                          />
                        </div>
                        {data.boost.finishesAt && (
                          <p className="mt-1.5 text-[11px] text-white/40">
                            Everyone by about {when(data.boost.finishesAt)}
                          </p>
                        )}
                      </>
                    )}
                    {counts.live > 0 && (
                      <p className="mt-2 flex gap-4 text-xs text-white/50">
                        <span>
                          <span className="text-rose-300">♥</span> {counts.liked} liked
                        </span>
                        <span>
                          <span className="text-sky-300">↻</span> {counts.reposted} reposted
                        </span>
                        <span>{nextOff ? `Comes off ${day(nextOff)}` : "Stays up"}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div>
                      <p className="mb-2 text-xs text-white/55">
                        Time between each fan
                        <span className="text-white/35">
                          {sending ? " · changes the rest of this send" : " · varies a little, so it looks natural"}
                        </span>
                      </p>
                      <Pills
                        options={GAP_OPTIONS}
                        value={plan.gapSeconds}
                        busy={busy === "pace"}
                        onPick={(seconds) => edit({ action: "pace", seconds })}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-xs text-white/55">
                        How long everyone keeps it up
                        <span className="text-white/35"> · from when it reached them</span>
                      </p>
                      <Pills
                        options={KEEP_OPTIONS}
                        value={plan.retainDays}
                        busy={busy === "keep_for"}
                        onPick={(days) => edit({ action: "keep_for", days }, "Updated for everyone.")}
                      />
                    </div>
                    {plan.retainDays !== null && (
                      <div>
                        <p className="mb-2 text-xs text-white/55">
                          How slowly it comes off
                          <span className="text-white/35"> · each fan at their own moment</span>
                        </p>
                        <Pills
                          options={REMOVAL_OPTIONS}
                          value={plan.removalMinutes}
                          busy={busy === "removal_pace"}
                          onPick={(minutes) => edit({ action: "removal_pace", minutes }, "Re-spread for everyone.")}
                        />
                      </div>
                    )}
                    {(canTakeAll || counts.takenOut > 0) && (
                      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                        {canTakeAll && (
                          <button
                            type="button"
                            onClick={askTakeAll}
                            disabled={busy === "take_out"}
                            className={clsx(
                              "rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50",
                              confirmAll
                                ? "bg-rose-500 text-white hover:bg-rose-400"
                                : "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                            )}
                          >
                            {busy === "take_out"
                              ? "Taking it off…"
                              : confirmAll
                                ? `Take it off ${counts.live + counts.waiting} fans?`
                                : "Take everyone out now"}
                          </button>
                        )}
                        {counts.takenOut > 0 && (
                          <button
                            type="button"
                            onClick={() => edit({ action: "put_back" }, "Putting everyone back.")}
                            disabled={busy === "put_back"}
                            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white/75 transition hover:bg-white/15 disabled:opacity-50"
                          >
                            Put {counts.takenOut} back
                          </button>
                        )}
                      </div>
                    )}
                    {flash && <p className="text-xs text-emerald-300/90">{flash}</p>}
                  </div>

                  {/* People */}
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <p className="text-xs text-white/55">
                        {people.length} saved fan{people.length === 1 ? "" : "s"}
                      </p>
                      {people.some((p) => p.state !== "skipped" && p.state !== "came_off" && p.state !== "failed") && (
                        <p className="text-[11px] text-white/30">Tap someone to edit</p>
                      )}
                    </div>
                    {people.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/40">
                        Nobody saved yet — fans join when they download.
                      </p>
                    ) : (
                      <ul className="-mx-3">
                        {shown.map((person) => (
                          <PersonRow
                            key={person.id}
                            person={person}
                            open={openPerson === person.id}
                            onToggle={() => setOpenPerson((id) => (id === person.id ? null : person.id))}
                            edit={(body) => edit(body)}
                            busy={busy !== null}
                          />
                        ))}
                      </ul>
                    )}
                    {people.length > PREVIEW && (
                      <button
                        type="button"
                        onClick={() => setShowAll((s) => !s)}
                        className="mt-2 w-full rounded-xl py-2.5 text-xs font-medium text-white/55 transition hover:bg-white/[0.04] hover:text-white/85"
                      >
                        {showAll ? "Show less" : `Show all ${people.length}`}
                      </button>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </motion.aside>
    </motion.div>,
    document.body
  );
}
