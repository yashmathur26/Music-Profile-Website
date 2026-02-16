/**
 * Calculate YVSH-specific stats from Spotify API responses.
 */

const YVSH_ARTIST_NAME = process.env.YVSH_ARTIST_NAME || "YVSH";

export interface SpotifyTrackItem {
  id: string;
  name: string;
  artists?: { name: string; id: string }[];
  album?: { name: string; images?: { url: string }[] };
}

export interface RecentPlayedItem {
  played_at: string;
  track?: SpotifyTrackItem;
}

export interface YvshStats {
  isYvshFan: boolean;
  mostPlayedSong: string | null;
  firstDiscoveryDate: string | null;
  totalYvshTracks: number;
  fanLevel: "casual" | "regular" | "superfan" | "obsessed";
  peakListeningHour: number | null;
  favoriteAlbum: string | null;
  recentStreaks: number;
  topYvshTracks: SpotifyTrackItem[];
  listeningPersonality: string;
}

function isYvshTrack(item: { track?: SpotifyTrackItem } | SpotifyTrackItem): boolean {
  const track = "track" in item ? item.track : item;
  if (!track) return false;
  return (track.artists ?? []).some(
    (a) => a.name.toLowerCase() === YVSH_ARTIST_NAME.toLowerCase()
  );
}

function getTrack(item: { track?: SpotifyTrackItem } | SpotifyTrackItem): SpotifyTrackItem | null {
  const t = "track" in item ? item.track : item;
  return t ?? null;
}

export function calculateYvshStats(data: {
  recentlyPlayed: { items?: RecentPlayedItem[] };
  topTracks4Weeks: { items?: SpotifyTrackItem[] };
  topTracks6Months: { items?: SpotifyTrackItem[] };
  topTracksAllTime: { items?: SpotifyTrackItem[] };
}): YvshStats {
  const recent = (data.recentlyPlayed.items ?? []).filter(isYvshTrack) as RecentPlayedItem[];
  const top4 = (data.topTracks4Weeks.items ?? []).filter((t) =>
    (t.artists ?? []).some((a) => a.name.toLowerCase() === YVSH_ARTIST_NAME.toLowerCase())
  );
  const top6 = (data.topTracks6Months.items ?? []).filter((t) =>
    (t.artists ?? []).some((a) => a.name.toLowerCase() === YVSH_ARTIST_NAME.toLowerCase())
  );
  const topAll = (data.topTracksAllTime.items ?? []).filter((t) =>
    (t.artists ?? []).some((a) => a.name.toLowerCase() === YVSH_ARTIST_NAME.toLowerCase())
  );

  const allIds = new Set([
    ...recent.map((r) => getTrack(r)?.id).filter(Boolean),
    ...top4.map((t) => t.id),
    ...top6.map((t) => t.id),
    ...topAll.map((t) => t.id),
  ] as string[]);
  const totalYvshTracks = allIds.size;
  const isYvshFan = totalYvshTracks > 0;

  const mostPlayedSong =
    top4[0]?.name ?? top6[0]?.name ?? topAll[0]?.name ?? null;

  const firstDiscoveryDate =
    recent.length > 0 ? recent[recent.length - 1].played_at : null;

  const fanLevel = ((): YvshStats["fanLevel"] => {
    if (totalYvshTracks === 0) return "casual";
    if (totalYvshTracks >= 5 && top4.length > 0) return "obsessed";
    if (totalYvshTracks >= 3 || top6.length > 1) return "superfan";
    if (totalYvshTracks >= 2) return "regular";
    return "casual";
  })();

  const peakListeningHour = ((): number | null => {
    if (recent.length === 0) return null;
    const hourCounts: Record<number, number> = {};
    recent.forEach((item) => {
      const hour = new Date(item.played_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peak = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];
    return peak ? parseInt(peak[0], 10) : null;
  })();

  const albumCounts: Record<string, number> = {};
  [...recent.map((r) => getTrack(r)), ...top6].forEach((track) => {
    if (!track?.album?.name) return;
    albumCounts[track.album.name] = (albumCounts[track.album.name] || 0) + 1;
  });
  const favoriteAlbum = Object.entries(albumCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  let recentStreaks = 0;
  if (recent.length > 0) {
    const playDates = [...new Set(recent.map((r) => new Date(r.played_at).toDateString()))].sort();
    let current = 1;
    for (let i = 1; i < playDates.length; i++) {
      const diff =
        (new Date(playDates[i]).getTime() - new Date(playDates[i - 1]).getTime()) /
        (1000 * 3600 * 24);
      if (diff === 1) {
        current++;
        recentStreaks = Math.max(recentStreaks, current);
      } else {
        current = 1;
      }
    }
    if (recentStreaks === 0 && playDates.length >= 1) recentStreaks = 1;
  }

  const topYvshTracks = [...top4.slice(0, 3), ...top6.slice(0, 2)]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .slice(0, 5);

  let listeningPersonality = "YVSH Enthusiast";
  if (recent.length > 0) {
    if (peakListeningHour !== null && peakListeningHour >= 22) listeningPersonality = "Night Owl YVSH Listener";
    else if (peakListeningHour !== null && peakListeningHour <= 6) listeningPersonality = "Early Bird YVSH Fan";
    else if (top4.length > 2) listeningPersonality = "YVSH Repeat Champion";
    else if (recent.length > 10) listeningPersonality = "YVSH Discovery Machine";
    else listeningPersonality = "Dedicated YVSH Supporter";
  } else {
    listeningPersonality = "Curious Explorer";
  }

  return {
    isYvshFan,
    mostPlayedSong,
    firstDiscoveryDate,
    totalYvshTracks,
    fanLevel,
    peakListeningHour,
    favoriteAlbum,
    recentStreaks,
    topYvshTracks,
    listeningPersonality,
  };
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}
