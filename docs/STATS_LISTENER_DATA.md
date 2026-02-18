# How We Get Listener Data for YVSH Stats

This document explains in detail how the stats feature obtains and uses Spotify listener data: from the user clicking “Connect with Spotify” to the numbers and labels shown on the dashboard.

---

## 1. Overview

We never see the user’s Spotify password. We use **OAuth 2.0**: the user signs in on Spotify’s site, Spotify sends us a short-lived **authorization code**, we exchange it for **tokens** (access + refresh), and we store those server-side. We then call Spotify’s **Web API** with the access token to read the user’s **recently played** and **top tracks**. We filter that data for tracks where the artist name matches YVSH (or `YVSH_ARTIST_NAME`) and compute all stats from that subset.

---

## 2. Step-by-step: From “Connect” to data

### 2.1 User clicks “Connect with Spotify”

- The button links to **`GET /api/auth/spotify`** (see `src/app/api/auth/spotify/route.ts`).
- The route:
  - Generates a random **state** (32 hex chars) to prevent CSRF.
  - Stores **state** and optional **returnTo** (e.g. `/stats`) in HTTP-only cookies: `spotify_stats_state`, `spotify_stats_return` (10 min TTL).
  - Redirects the browser to **Spotify’s authorization URL** with:
    - `client_id` (our Spotify app)
    - `redirect_uri`: `{NEXT_PUBLIC_APP_URL}/api/auth/spotify/callback`
    - `response_type=code`
    - `scope`: `user-read-recently-played user-top-read user-read-private`
    - `state` (same value as in the cookie)

So we **don’t get any listener data yet** — we only send the user to Spotify to approve access.

### 2.2 User approves on Spotify

- The user logs in (if needed) and approves the requested scopes.
- Spotify redirects the browser to:
  - **`GET /api/auth/spotify/callback?code=...&state=...`**

We still don’t have listening data; we only have a **one-time code** in the URL.

### 2.3 Callback: code → tokens → session

- **`GET /api/auth/spotify/callback`** (see `src/app/api/auth/spotify/callback/route.ts`):
  1. Reads `code` and `state` from the query; reads `spotify_stats_state` and `spotify_stats_return` from cookies.
  2. **Validates `state`** against the cookie (must match). If not, redirects to `/stats?error=access_denied` and clears cookies.
  3. **Exchanges the code for tokens** by calling Spotify’s token endpoint (`POST https://accounts.spotify.com/api/token`) with:
     - `grant_type=authorization_code`
     - `code` (from the URL)
     - `redirect_uri` (must match exactly what we used in the authorize URL)
     - Auth: `Basic` with `client_id:client_secret` (base64).
  4. Spotify returns:
     - **access_token** — used for every API request (short-lived, e.g. 1 hour).
     - **refresh_token** — used to get a new access token when it expires.
     - **expires_in** — seconds until the access token expires.
  5. **Gets the Spotify user ID** by calling Spotify’s `GET https://api.spotify.com/v1/me` with `Authorization: Bearer <access_token>` (so we can associate the session with one user).
  6. **Creates a session** in our database:
     - Generates a random **session id** (e.g. `nanoid(32)`).
     - Inserts one row into the **`stats_sessions`** table (Supabase) with: `id`, `spotify_user_id`, `access_token`, `refresh_token`, `expires_at`, `created_at`.
  7. **Sets an HTTP-only cookie** `yvsh_stats_session` with value = that session id (e.g. 7-day max age, `SameSite=Lax`, `Secure` in production).
  8. Clears the OAuth cookies (`spotify_stats_state`, `spotify_stats_return`) and **redirects the user** to `returnTo` (default `/stats`).

At this point we have **tokens stored in our DB** and the **browser only has the session id in a cookie**. No raw tokens are ever sent to the frontend.

### 2.4 Frontend requests stats

- The `/stats` page (or any client) calls **`GET /api/stats/spotify`** (no body).
- The browser automatically sends the cookie `yvsh_stats_session` with the request.

### 2.5 Stats API: session → valid token → Spotify API → computed stats

- **`GET /api/stats/spotify`** (see `src/app/api/stats/spotify/route.ts`):
  1. Reads the **session id** from the cookie `yvsh_stats_session`. If missing → **401**.
  2. Loads the **session** from `stats_sessions` by that id. If not found → **401**.
  3. **Access token validity:**
     - If `expires_at` is in the future (with a 1-minute buffer), use the stored **access_token**.
     - Otherwise, call Spotify’s token endpoint with `grant_type=refresh_token` and the session’s **refresh_token** to get a new **access_token**, then **update** the session row with the new token and new `expires_at`.
  4. **Fetches listener data from Spotify** (see section 3 below) using the (possibly refreshed) access token — four requests in parallel.
  5. **Runs `calculateYvshStats(...)`** (see section 4) on the combined data and returns the result as JSON.

So **listener data is fetched on our server**, using the token tied to the session id in the cookie. The client only receives the **already-computed stats** (and never the raw Spotify responses or tokens).

---

## 3. Exactly which Spotify API endpoints we call

We call **four** endpoints, all with the same access token in the header:  
`Authorization: Bearer <access_token>`.

| Endpoint | Purpose | What we use it for |
|--------|----------|---------------------|
| **GET /v1/me/player/recently-played?limit=50** | Last 50 tracks the user played (with `played_at` timestamps). | Recent YVSH plays, peak hour, first discovery, streaks, favorite album, personality. |
| **GET /v1/me/top/tracks?time_range=short_term&limit=50** | User’s top 50 tracks over **last ~4 weeks**. | Fan level, most played song, top YVSH tracks list. |
| **GET /v1/me/top/tracks?time_range=medium_term&limit=50** | Top 50 over **last ~6 months**. | Fan level, most played (fallback), top YVSH tracks, favorite album. |
| **GET /v1/me/top/tracks?time_range=long_term&limit=50** | Top 50 **all time**. | Fan level, most played (fallback), total YVSH track count. |

- **Scopes required:**  
  - `user-read-recently-played` — for recently played.  
  - `user-top-read` — for top tracks (any time range).  
  - `user-read-private` — for `/me` (we use it in the callback to get `spotify_user_id`).

- **Response shapes (simplified):**
  - **Recently played:** `{ items: [ { played_at: "ISO8601", track: { id, name, artists: [{ name, id }], album: { name, images } } }, ... ] }`
  - **Top tracks:** `{ items: [ { id, name, artists: [{ name, id }], album: { name, images } }, ... ] }`

We do **not** store the raw JSON long-term; we only use it inside the stats API to compute `YvshStats` and then return that.

---

## 4. How we identify “YVSH” tracks and compute each stat

All filtering is done in **`src/lib/statsCalculator.ts`**. The artist name we look for is **`YVSH_ARTIST_NAME`** (env, default `"YVSH"`), compared **case-insensitively**.

- **“Is this track YVSH?”**  
  We consider a track YVSH if **any** of its `artists` has `name` (after lowercasing) equal to `YVSH_ARTIST_NAME` (lowercased).  
  So we use **recently-played items** and **top-track items** only when that condition is true.

### 4.1 Data we derive from the four responses

- **Recent YVSH plays:**  
  `recentlyPlayed.items` filtered to items whose `track.artists` include the YVSH artist name. We keep the full item (including `played_at` and `track`).

- **Top YVSH (4 weeks / 6 months / all time):**  
  Each of the three top-tracks responses: take `items`, filter to tracks that have the YVSH artist in `artists`. We get three arrays: e.g. `top4`, `top6`, `topAll`.

### 4.2 How each stat is computed

| Stat | Source data | Logic |
|------|-------------|--------|
| **totalYvshTracks** | Recent + top4 + top6 + topAll | Set of unique track **ids** across all those lists → `size` of the set. |
| **isYvshFan** | Above | `totalYvshTracks > 0`. |
| **mostPlayedSong** | top4, top6, topAll | `top4[0].name` else `top6[0].name` else `topAll[0].name` (first YVSH track in each list, in that order). |
| **firstDiscoveryDate** | Recent YVSH plays | If any: `played_at` of the **oldest** item in the recent YVSH list (last in the array). |
| **fanLevel** | totalYvshTracks, top4, top6 | Rules: 0 → casual; ≥5 and top4 has at least one → obsessed; ≥3 or top6 has more than one → superfan; ≥2 → regular; else casual. |
| **peakListeningHour** | Recent YVSH plays | Histogram of hour (0–23) from each `played_at`; hour with max count. |
| **favoriteAlbum** | Recent YVSH tracks + top6 | Count occurrences of `track.album.name`; pick the album name with highest count. |
| **recentStreaks** | Recent YVSH plays | Unique calendar days with a play, sorted; longest run of consecutive days (diff = 1 day); if no run, 1 if any play. |
| **topYvshTracks** | top4, top6 | First 3 from top4 and first 2 from top6, deduplicated by id, then take first 5. |
| **listeningPersonality** | recent, peakListeningHour, top4 | Heuristic labels, e.g. night owl (peak ≥ 22), early bird (peak ≤ 6), “YVSH Repeat Champion” (top4 has >2), “YVSH Discovery Machine” (recent count > 10), etc. |

So **every number and label** on the stats page comes from these four Spotify API responses, filtered to YVSH-only, then passed through `calculateYvshStats`. We do not use any other APIs or any data that wasn’t returned by Spotify for that user and that token.

---

## 5. Where the data lives (and what the client sees)

- **Spotify:** Holds the actual listening history and top tracks; we only read it via the Web API when the user has connected and we have a valid token.
- **Our server (Supabase):** Stores only **sessions** in `stats_sessions`: session id, `spotify_user_id`, `access_token`, `refresh_token`, `expires_at`, `created_at`. We do **not** store the user’s recently played or top tracks; we fetch them on demand when `/api/stats/spotify` is called.
- **Browser:** Only gets:
  - The **session id** in the HTTP-only cookie `yvsh_stats_session`.
  - The **computed stats object** (e.g. fan level, most played song, top YVSH tracks list, etc.) as JSON from `GET /api/stats/spotify`.

So: **we get listener data by (1) OAuth to obtain tokens, (2) storing tokens in the DB keyed by session id, (3) when the frontend asks for stats, loading the session, refreshing the token if needed, calling the four Spotify endpoints above, and (4) filtering for YVSH and computing every stat in `statsCalculator`.** The list of “songs” (and all other stats) the user sees is that computed result, not raw Spotify payloads.
