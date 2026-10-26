# YVSH Website Rebuild — Spotify Presave System

## Overview

Rebuild yvshmusic.com into a custom Next.js site with a **true Spotify presave system** — the same thing HyperEdit, Feature.fm, and ToneDen do, but self-hosted on your domain. Fan clicks presave → logs into Spotify → on release day, the track auto-saves to their library. No third-party branding, no monthly fees, you own all the data.

---

## How Spotify Presaves Actually Work (Under The Hood)

This is what HyperEdit and Feature.fm do. We're building the same thing on your site.

### The Core Mechanism

```
BEFORE RELEASE DAY:

1. Fan visits yvshmusic.com
2. Fan clicks "Pre-save on Spotify"
3. A Spotify login popup appears ("YVSH Music wants to access your Spotify")
4. Fan clicks "Agree" → Spotify sends your server a token (permission slip)
5. Your server stores that token in a database
6. Fan sees "You're locked in 🔒" confirmation
7. Repeat for every fan who presaves

ON RELEASE DAY:

8. Your track goes live on Spotify (your distributor handles this)
9. You grab the Spotify track URI and paste it into your admin/config
10. Your server loops through every stored fan token
11. For each fan, it calls Spotify's API: "Save this track to their library"
12. Every fan wakes up with your track in their Liked Songs + Release Radar
```

The "presave" is really just: **collect permissions now, use them later.**

### Why This Matters For The Algorithm

When a track gets saved to hundreds of libraries simultaneously on Day 1, Spotify's algorithm interprets this as strong organic interest. This directly influences:

- **Release Radar** — fans who presaved get it in their Release Radar automatically
- **Discover Weekly** — the save signal feeds into recommendation models
- **Editorial playlists** — Spotify's editorial team sees high Day 1 save rates as a signal worth investigating
- **Algorithmic playlists** — more saves = more playlist placements = more listeners = snowball effect

The key metric is **Day 1 saves**. A presave system front-loads those saves so they all hit at once instead of trickling in over days.

### The Full Technical Flow

**Step 1: Fan clicks "Pre-save on Spotify"**

Your site redirects the fan to Spotify's authorization URL:
```
https://accounts.spotify.com/authorize?
  client_id=YOUR_APP_CLIENT_ID
  &response_type=code
  &redirect_uri=https://yvshmusic.com/api/spotify/callback
  &scope=user-library-modify
```

The `user-library-modify` scope is the key — it lets your app save tracks to the fan's library on their behalf.

**Step 2: Fan logs in and approves**

Spotify shows their standard login page. Fan logs in (or is already logged in) and sees: *"YVSH Music wants to: Add and remove items in Your Library."* Fan clicks Agree.

**Step 3: Spotify redirects back to your site**

Spotify redirects to `https://yvshmusic.com/api/spotify/callback?code=XXXXX`. Your backend API route receives this authorization code.

**Step 4: Your server exchanges the code for tokens**

Your backend calls Spotify's token endpoint with the authorization code. Spotify responds with:
- `access_token` — works for 1 hour (useless for presaves since release is days/weeks away)
- `refresh_token` — **works indefinitely** until the fan manually revokes it. THIS is what you store.

**Step 5: Store the refresh token in the database**

Your server saves:
```json
{
  "refreshToken": "AQDf8s9d8f...",
  "spotifyUserId": "user123",
  "campaignId": "10-outta-10",
  "createdAt": "2026-02-15T..."
}
```

**Step 6: Fan sees confirmation**

Redirect fan to a success page: *"You're locked in! 10 outta 10 will be saved to your Spotify on March 1st."* Optionally show a presave counter for social proof (*"312 fans presaved"*).

**Step 7: RELEASE DAY — Trigger the saves**

Once your track is live on Spotify, grab the Spotify URI (looks like `spotify:track:4iV5W9uYEdYUVa79Axb7Rh`). Then your server:

1. Fetches all refresh tokens for the current campaign from the database
2. For each fan: uses their refresh token to get a fresh access token
3. Calls `PUT /v1/me/tracks` with the track URI
4. Track is now saved in that fan's library
5. Logs success/failure for each

### What You Need (That A Static Site Doesn't Have)

| Component | What It Does | Tool (Free Tier) |
|-----------|-------------|-----------------|
| **Spotify Developer App** | API credentials (Client ID + Secret) | Free at developer.spotify.com |
| **OAuth Flow** | The Spotify popup asking fans for permission | Spotify Authorization Code Flow |
| **Backend API Routes** | Handles OAuth callback, stores tokens, triggers saves | Vercel Serverless Functions |
| **Database** | Stores fan refresh tokens per campaign | Supabase (free: 50K rows) or Vercel KV |
| **Release Day Trigger** | Runs the save loop for all fans | Vercel Cron Job or manual API endpoint |

**Total cost: $0/month** on free tiers. Compare to Feature.fm at $10-50/month.

---

## What Fans Actually See

### Before Release

1. Fan clicks your TikTok/IG bio link → lands on yvshmusic.com
2. Splash page shows cover art + "PRE-SAVE 10 OUTTA 10" with a glowing badge and countdown
3. Fan clicks the big Spotify presave button
4. Spotify login popup appears → fan approves
5. Redirected to confirmation: *"You're locked in 🔒 Dropping March 1st"*
6. Below: optional secondary links (SoundCloud follow, Apple Music, etc.)

### Release Day (Automatic)

1. Fan's Spotify Liked Songs now has your track (auto-saved)
2. Track appears in their Release Radar
3. Site countdown shows "OUT NOW"
4. Presave button swaps to "Listen on Spotify" (direct link to track)

### After Campaign

1. You set `isActive: false` in the config, push to GitHub
2. Site reverts to normal "CLICK TO ENTER" splash → regular homepage
3. Fan tokens stay in your database for future campaigns

---

## Your Workflow For Each Release

```
WEEKS BEFORE RELEASE:
1. Drop cover art in /public/covers/
2. Edit campaign.ts — track title, date, isActive: true
3. git push → presave page is live in 30 seconds
4. Share yvshmusic.com on TikTok/IG/socials
5. Fans presave, tokens accumulate in your database

RELEASE DAY:
6. Your distributor delivers the track to Spotify
7. Go to Spotify → copy the track URI
8. Paste into config OR hit your /api/trigger-saves endpoint
9. Server saves the track to every fan's library
10. Done. Day 1 saves are stacked.

POST-RELEASE:
11. Site auto-switches to "OUT NOW" mode with stream links
12. When done, set isActive: false, push → site reverts to normal

NEXT RELEASE:
13. Repeat from step 1
14. Bonus: you still have all the tokens from previous campaigns
    → you can re-notify/re-engage past presavers
```

---

## Tech Stack

You're already on Vercel with React, so we're building on what you have. The recommendation is Next.js (App Router) since it's still React — same components, same JSX, same hooks — but with API routes for the backend and better SEO. Vercel made Next.js so they work perfectly together.

| Layer | Tool | Why |
|-------|------|-----|
| Framework | **Next.js 14+ (App Router)** | React + API routes + SEO. Native to Vercel. |
| Styling | **Tailwind CSS + custom CSS** | Rapid styling, keeps the space aesthetic |
| Animation | **Framer Motion** | Page transitions, starfield parallax, scroll reveals |
| Hosting | **Vercel (already using)** | Free tier covers serverless functions + hosting |
| Database | **Supabase (free tier)** | Stores fan Spotify tokens. 50K rows free. PostgreSQL. |
| Auth | **Spotify OAuth** | Authorization Code Flow for presaves |
| Cron | **Vercel Cron Jobs** | Triggers release-day saves automatically |

---

## The Campaign Config File

This is still the command center. One file controls everything visible on the site:

```typescript
// src/config/campaign.ts

export const campaign = {
  // ━━━ FLIP THIS TO TURN CAMPAIGNS ON/OFF ━━━
  isActive: true,

  // ━━━ TRACK INFO ━━━
  trackTitle: "10 outta 10",
  trackArtist: "YVSH",
  trackDescription: "new heat. march 1st.",
  coverArt: "/covers/10outta10.jpg",

  // ━━━ RELEASE DATE ━━━
  releaseDate: "2026-03-01T00:00:00Z",
  showCountdown: true,

  // ━━━ SPOTIFY PRESAVE ━━━
  spotify: {
    enabled: true,
    // Leave empty until track is live, then paste the URI to trigger saves
    trackUri: "",  // → "spotify:track:4iV5W9uYEdYUVa..."
  },

  // ━━━ ADDITIONAL LINKS (not presave, just link buttons) ━━━
  additionalLinks: [
    { platform: "SoundCloud", url: "https://soundcloud.com/yvsh" },
    { platform: "Apple Music", url: "https://music.apple.com/..." },
  ],

  // ━━━ POST-RELEASE STREAM LINKS (auto-switch after releaseDate) ━━━
  streamLinks: [
    { platform: "Spotify", url: "https://open.spotify.com/track/...", primary: true },
    { platform: "SoundCloud", url: "https://soundcloud.com/yvsh/...", primary: false },
    { platform: "Apple Music", url: "https://music.apple.com/...", primary: false },
  ],

  // ━━━ VISUAL / OPTIONAL ━━━
  accentColor: "#1DB954",       // Spotify green, or any hex color
  showPresaveCount: true,       // "312 fans presaved" counter
  showEmailCapture: true,       // collect emails alongside presave
  emailWebhook: "https://hooks.zapier.com/...",
};
```

### What The Config Controls

| Field | What It Does |
|-------|-------------|
| `isActive` | Toggle the entire campaign on/off. `false` = normal site, no presave. |
| `trackTitle` | Appears on splash page, presave section, SEO meta tags, social share preview |
| `coverArt` | Displayed on splash page and presave section with glow effects |
| `releaseDate` | Powers the countdown timer + triggers presave→stream link auto-switch |
| `spotify.trackUri` | Paste this on release day to trigger the auto-save for all fans |
| `additionalLinks` | Secondary platform buttons (SoundCloud, Apple, etc.) — just links, no OAuth |
| `streamLinks` | Replace everything after release date passes |
| `accentColor` | Tints the campaign section, glow effects, buttons |
| `showPresaveCount` | Queries the database to show how many fans presaved |

---

## Site Architecture

### Navigation (Left Sidebar)

Based on your current sidebar, add "Pre-save" as a new nav item:

```
┌─────────────────┐
│  ← (collapse)   │
│                  │
│  🌀 Y V S H     │
│                  │
│  🏠 Home         │  ← current
│  🎵 Pre-save     │  ← NEW (only shows when campaign isActive)
│  🛒 Shop         │  ← current
│  ⬇️ Downloads    │  ← current
│                  │
└─────────────────┘
```

The "Pre-save" nav item only appears when `campaign.isActive === true`. When the campaign is off, it disappears and the sidebar looks exactly like it does now.

### Routing — Everything Points To `/presave`

All presave CTAs across the site funnel to one dedicated page:

```
Fan clicks "PRE-SAVE" on splash/landing page
  → navigates to /presave

Fan clicks "Pre-save" in the left sidebar
  → navigates to /presave

Fan clicks presave indicator on homepage hero section
  → navigates to /presave

/presave is THE presave page with full functionality:
  - Cover art, track title, countdown
  - Spotify OAuth presave button
  - Additional platform links
  - Email capture
  - Presave counter
```

This keeps things clean — there's one presave page, and every CTA across the site just routes there. No duplicated presave UI in multiple places.

### File Structure

```
src/
├── config/
│   └── campaign.ts              ← THE ONE FILE YOU EDIT PER RELEASE
├── app/
│   ├── layout.tsx               ← Root layout, starfield bg, LEFT SIDEBAR, global styles
│   ├── page.tsx                 ← Splash / landing page (before "click to enter")
│   ├── home/
│   │   └── page.tsx             ← Main homepage (after entering)
│   ├── presave/
│   │   ├── page.tsx             ← DEDICATED PRESAVE PAGE (full campaign UI)
│   │   └── success/
│   │       └── page.tsx         ← "You're locked in" confirmation after OAuth
│   ├── shop/
│   │   └── page.tsx             ← Existing shop page
│   ├── downloads/
│   │   └── page.tsx             ← Existing downloads page
│   └── api/
│       ├── spotify/
│       │   ├── authorize/
│       │   │   └── route.ts     ← Redirects fan to Spotify login
│       │   └── callback/
│       │       └── route.ts     ← Handles OAuth callback, stores token
│       ├── presave-count/
│       │   └── route.ts         ← Returns count of presaves for this campaign
│       ├── trigger-saves/
│       │   └── route.ts         ← Release day: saves track to all fans' libraries
│       └── email-capture/
│           └── route.ts         ← Handles email submissions
├── components/
│   ├── Starfield.tsx            ← Animated star background (canvas)
│   ├── Sidebar.tsx              ← LEFT SIDEBAR NAV (campaign-aware)
│   ├── Logo.tsx                 ← YVSH circular logo with float animation
│   ├── SplashPage.tsx           ← Landing page (campaign-aware)
│   ├── HeroSection.tsx          ← Artist name, bio, social links
│   ├── PresavePage.tsx          ← Full presave page content
│   ├── SpotifyPresaveButton.tsx ← The OAuth-triggering presave button
│   ├── CountdownTimer.tsx       ← Days/hrs/min/sec to release
│   ├── PresaveCounter.tsx       ← "312 fans presaved" display
│   ├── PlatformLinks.tsx        ← Grid of platform buttons
│   ├── EmailCapture.tsx         ← Email signup form
│   ├── NowPlaying.tsx           ← SoundCloud/Spotify embeds
│   └── Footer.tsx               ← Simple footer
├── lib/
│   ├── spotify.ts               ← Spotify API helper functions
│   └── supabase.ts              ← Database client setup
└── public/
    ├── avatar.png               ← YVSH logo
    └── covers/                  ← Campaign cover art images
```

---

## Page-by-Page Spec

### Page 1: Splash / Landing (`/`)

Full viewport, centered, animated starfield background. **No sidebar on this page** — it's the gateway.

**When campaign is active (`isActive: true`):**
- Glowing "NEW MUSIC" badge with pulsing dot
- Cover art displayed large with glow effect
- Track title in bold gradient text
- Countdown timer (if `showCountdown: true`)
- Big CTA: **"PRE-SAVE ON SPOTIFY"** → **navigates to `/presave`**
- Small "or enter site →" link to `/home`

**When no campaign (`isActive: false`):**
- YVSH logo with float animation
- "CLICK TO ENTER" button → `/home`
- Classic behavior, same as current site

### Page 2: Main Site / Homepage (`/home`)

**Left Sidebar (persistent across all inner pages):**

Matches your current sidebar layout:
- Collapse arrow at top
- YVSH logo + name
- **Home** → `/home`
- **Pre-save** → `/presave` (only visible when `campaign.isActive === true`, with a subtle glow/badge to draw attention)
- **Shop** → `/shop`
- **Downloads** → `/downloads` (collapsible, same as current)

The sidebar is rendered in the root layout so it persists across Home, Pre-save, Shop, and Downloads without remounting.

**Main Content Area (right of sidebar):**

**Section 1 — Hero:**
- YVSH logo (large), artist name, bio/tagline
- Social link buttons (SoundCloud, IG, TikTok)
- If campaign active: a banner or card teaser that says something like "10 outta 10 — dropping March 1st" with a **"Pre-save now →"** button that navigates to `/presave`

**Section 2 — Now Playing:**
- SoundCloud embed player
- Spotify embed
- Configurable via config file

**Section 3 — Footer:**
- © 2026 YVSH + social links

### Page 3: Pre-save Page (`/presave`) — THE DEDICATED PRESAVE PAGE

This is the full presave experience. Everything presave-related lives here. Sidebar stays visible on the left, presave content fills the main area.

**Layout (within the main content area, right of sidebar):**

- **Cover Art** — large, centered, with glow shadow tinted to `accentColor`. Floating animation.
- **Track Title** — big, bold, gradient text
- **Artist tag** — "YVSH" below title
- **Description/tagline** — from config
- **Countdown Timer** (if `showCountdown: true`):
  - Days | Hours | Minutes | Seconds
  - When ≤ 0: displays "OUT NOW"
- **Spotify Presave Button** — the big OAuth-triggering CTA
  - Before release: "Pre-save on Spotify" → triggers OAuth flow
  - After release: "Listen on Spotify" → direct link to track
  - If fan already presaved (localStorage check): "Presaved ✓"
- **Presave Counter** — "312 fans presaved" with live updates
- **Additional Platform Links** — secondary buttons for SoundCloud, Apple Music, etc.
- **Email Capture** (if enabled) — glassmorphism card with email input
- **Share Section** — "Share this with your friends" with copy-link and social share buttons

**Visual Treatment:**
- The presave content should feel premium — centered, spacious, with the cover art as the hero element
- Glassmorphism card containing the presave controls
- Accent color from config tints the glow, buttons, and countdown
- Animate in with Framer Motion (fade up + stagger)
- Starfield background continues behind the sidebar and content

### Page 4: Presave Success (`/presave/success`)

Fan lands here after completing Spotify OAuth. Sidebar still visible.

- Confetti or celebration animation
- "You're locked in 🔒"
- Track title + release date reminder
- "This track will be saved to your Spotify on [date]"
- Share buttons (share the presave link on Twitter/IG)
- "← Back to site" link to `/home`

---

## API Routes Spec

### `POST /api/spotify/authorize`

Constructs the Spotify authorization URL with the correct scopes and redirects the fan. Sets a state parameter for CSRF protection.

### `GET /api/spotify/callback`

Spotify redirects here after fan approves. This route:
1. Exchanges the authorization code for access + refresh tokens
2. Optionally fetches the fan's Spotify user ID from `/v1/me`
3. Stores `{ refreshToken, spotifyUserId, campaignId, createdAt }` in Supabase
4. Redirects fan to `/presave/success`

### `GET /api/presave-count`

Returns the count of presaves for the current campaign. Used by the PresaveCounter component.
```json
{ "count": 312 }
```

### `POST /api/trigger-saves`

**This is the release-day endpoint.** Protected by a secret key (only you can call it).

1. Reads `spotify.trackUri` from the config (or accepts it as a body parameter)
2. Fetches all refresh tokens for the current campaign from Supabase
3. For each token:
   - Exchanges refresh token for a fresh access token
   - Calls `PUT /v1/me/tracks` with the track URI
   - Marks the record as "saved" or "failed" in the database
4. Returns a summary: `{ total: 312, saved: 308, failed: 4 }`

This can also be triggered automatically via a Vercel Cron Job that checks if `releaseDate` has passed and `trackUri` is set.

### `POST /api/email-capture`

Receives email from the form, forwards it to the `emailWebhook` URL in the config (Zapier, Mailchimp, etc.). Also optionally stores it in Supabase.

---

## Spotify Developer Setup (One-Time)

This only needs to be done once:

1. Go to https://developer.spotify.com/dashboard
2. Create a new app called "YVSH Music" (or whatever you want)
3. Set the redirect URI to: `https://yvshmusic.com/api/spotify/callback`
4. Copy the **Client ID** and **Client Secret**
5. Add them as environment variables in Vercel:
   - `SPOTIFY_CLIENT_ID=xxxxx`
   - `SPOTIFY_CLIENT_SECRET=xxxxx`
6. Done. Never touch this again.

**Important:** Spotify apps start in "Development Mode" which allows up to 25 users. To allow unlimited fans to presave, you need to submit a **quota extension request** through the Spotify Developer Dashboard. This is free — you just describe what your app does and Spotify approves it (usually within a few days). Do this BEFORE your first campaign.

---

## Database Schema (Supabase)

One table handles everything:

### `presaves` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (primary key) | Auto-generated |
| `campaign_id` | text | e.g. "10-outta-10" — ties to the campaign config |
| `spotify_user_id` | text | Fan's Spotify user ID |
| `refresh_token` | text | Encrypted. The token used to save tracks on their behalf. |
| `email` | text (nullable) | Fan's email if they provided it |
| `saved` | boolean (default false) | Flipped to true after release-day save succeeds |
| `created_at` | timestamp | When the fan presaved |

**Row-Level Security:** Enable RLS in Supabase. The API routes use a service role key (server-side only) to read/write. No client-side database access.

---

## Component Specs

### Starfield Component
- Canvas-based animated particle field
- Multiple layers at different speeds for parallax depth
- Colors: whites, light blues, subtle purples/pinks
- Fixed position, covers viewport, rendered in root layout (persists across pages)
- Performant: requestAnimationFrame, no heavy GPU work

### Sidebar Component
- Matches current site layout: collapse button, logo + "YVSH", nav items
- Campaign-aware: "Pre-save" nav item only renders when `campaign.isActive === true`
- The Pre-save nav item should have a subtle indicator (glow dot, badge, or accent color highlight) to draw attention
- Active page highlighted (same as current site behavior)
- Collapsible (same as current)
- Rendered in root layout so it persists across `/home`, `/presave`, `/shop`, `/downloads`
- NOT shown on the splash landing page (`/`) — splash is full-screen with no sidebar
- Mobile: collapses into a hamburger menu or bottom nav

### Spotify Presave Button
- Big, prominent button with Spotify green (or campaign accent color)
- Spotify logo icon + "Pre-save on Spotify"
- On click: redirects to `/api/spotify/authorize` which bounces to Spotify
- After presave: shows "Presaved ✓" state (check localStorage for returning fans)
- Hover: glow + slight scale

### Countdown Timer
- Takes `releaseDate` from config
- Displays: Days | Hours | Minutes | Seconds
- Each unit in its own box with label
- Updates every second via `setInterval`
- When ≤ 0: displays "OUT NOW" and triggers the stream link swap
- Subtle flip/fade animation on number change

### Presave Counter
- Fetches from `/api/presave-count` on mount
- Displays: "312 fans presaved" with a subtle pulse animation
- Updates periodically (every 30s) for live feel
- Social proof — fans see others have presaved

### Platform Links
- Grid of buttons for secondary platforms (SoundCloud, Apple Music, YouTube)
- Each opens URL in new tab
- SVG icons for each platform
- Before release: shows `additionalLinks`
- After release: shows `streamLinks` with Spotify as primary

### Email Capture
- Input field + submit button inside a glassmorphism card
- On submit: POST to `/api/email-capture`
- States: default → loading → success ("You're in 🔥") → error
- Uses localStorage to remember submission (don't show again to same fan)

---

## Design System

### Colors

| Token | Value | Use |
|-------|-------|-----|
| `bg-deep` | `#0a0a14` | Main background |
| `bg-mid` | `#12101f` | Card backgrounds |
| `text-primary` | `#f0eef6` | Headings |
| `text-secondary` | `#9994b8` | Body text |
| `text-dim` | `#5d577a` | Labels |
| `accent` | Per campaign | Campaign accent (default `#1DB954` Spotify green) |
| `glass-bg` | `rgba(255,255,255,0.04)` | Glass fills |
| `glass-border` | `rgba(255,255,255,0.08)` | Glass borders |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Track titles | Outfit (or similar bold display) | 800 | 36-52px |
| Section headers | Outfit | 600 | 18-24px, letter-spacing 3px, uppercase |
| Body text | Outfit | 300-400 | 14-16px |
| Countdown numbers | Space Mono | 700 | 32-48px |
| Labels/badges | Space Mono | 400-700 | 11-13px, uppercase |

### Glassmorphism Cards

- Background: `rgba(255, 255, 255, 0.04)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Backdrop-filter: `blur(20px)`
- Border-radius: `16px`
- Accent glow on hover using campaign `accentColor`

### Animations

- **Page enter:** Fade + scale (Framer Motion, 0.8s)
- **Scroll reveals:** Fade up + translateY, staggered children
- **Logo float:** CSS keyframes, 6s ease-in-out infinite
- **Countdown tick:** Flip/fade on number change
- **Button hover:** Scale 1.02, glow increase, 0.3s
- **Presave success:** Confetti burst or celebration particles

---

## Development Phases

### Phase 1 — Foundation
- Next.js project setup with Tailwind, Framer Motion
- Campaign config file with TypeScript types
- Starfield component
- Logo component
- Splash page (both campaign and non-campaign states)
- Page transition splash → main

### Phase 2 — Main Page
- Navbar
- Hero section (name, bio, socials)
- Now Playing section with embeds
- Footer

### Phase 3 — Spotify Presave Backend
- Spotify Developer App setup instructions
- Supabase database setup + `presaves` table
- `/api/spotify/authorize` route
- `/api/spotify/callback` route (token exchange + storage)
- `/api/presave-count` route
- Presave success page

### Phase 4 — Presave Frontend
- PresaveSection component
- SpotifyPresaveButton component (triggers OAuth)
- CountdownTimer component
- PresaveCounter component
- PlatformLinks component
- Wire splash page CTA to presave flow

### Phase 5 — Release Day System
- `/api/trigger-saves` endpoint
- Vercel Cron Job setup (checks if release date passed + trackUri is set)
- Automatic presave→stream link switching
- Test the full lifecycle

### Phase 6 — Fan Engagement + Polish
- Email capture component + `/api/email-capture` route
- Responsive design pass (mobile-first — fans hit this from their phones)
- SEO meta tags + Open Graph (cover art + track name when shared on socials)
- Performance optimization
- Presave success page share buttons
- Deploy + test full campaign lifecycle

---

## Deployment

You're already on Vercel with yvshmusic.com, so no infrastructure changes needed.

### If Adding To Existing Project
1. Add new components, API routes, and config to your repo
2. Add Spotify + Supabase env vars in Vercel dashboard
3. Push to GitHub → auto-deploys

### If Starting Fresh
1. `npx create-next-app@latest yvshmusic-site`
2. Push to new GitHub repo
3. Import in Vercel, reassign `yvshmusic.com` domain
4. Add env vars, deploy

### Environment Variables (in Vercel Dashboard)

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
TRIGGER_SAVES_SECRET=a_random_secret_string_you_make_up
```

---

## Key Notes For Cursor

1. **The config file is the single source of truth** for all campaign UI. Components import from it — never hardcode campaign info in components.

2. **The presave→stream auto-switch is client-side.** Compare `releaseDate` to `Date.now()` on render. Even if the config isn't updated, the UI auto-switches.

3. **The release-day save trigger is server-side.** The `/api/trigger-saves` endpoint must be protected with `TRIGGER_SAVES_SECRET` so only you can call it.

4. **Spotify refresh tokens are sensitive.** Store them encrypted in Supabase. Never expose them client-side.

5. **Spotify's Development Mode caps at 25 users.** Before the first campaign, submit a quota extension request in the Spotify Developer Dashboard. It's free and usually approved in a few days. Without this, only 25 fans can presave.

6. **The starfield must render in root layout** so it persists across pages without remounting.

7. **Mobile-first is critical.** Fans will visit from TikTok/IG bio link on their phones. The presave flow must be seamless on mobile — the Spotify OAuth popup works in mobile browsers but test thoroughly.

8. **Open Graph tags should be dynamic.** When campaign is active, social share previews should show cover art + track title. Use Next.js metadata API to set these based on the config.

9. **localStorage for returning fans.** After a fan presaves, store a flag in localStorage. If they return, show "Presaved ✓" instead of the presave button. Don't re-run OAuth.

10. **Supabase free tier = 50,000 rows.** That's 50,000 presaves across all campaigns. More than enough. If you outgrow it, Supabase Pro is $25/mo.

11. **Fan token reuse across campaigns.** When a fan presaves Campaign A, their refresh token stays in the database. For Campaign B, you can either ask them to presave again (safer, more engagement) or reuse the existing token (frictionless but fans don't explicitly opt in to the new track).

12. **Rate limits.** Spotify API has rate limits. When triggering saves for hundreds of fans, add a small delay (100-200ms) between requests to avoid getting throttled. Process in batches of 50.

13. **Vercel free tier has a 10-second function timeout.** The `/api/trigger-saves` endpoint needs to process fans in batches, not all at once. If you have 500 presaves, process 50 at a time across multiple invocations (e.g., a queue or chained fetch calls). Alternatively, Vercel Pro ($20/mo) gives 60-second limits. Design the trigger endpoint to handle this gracefully — return partial progress and allow re-triggering to continue where it left off.
