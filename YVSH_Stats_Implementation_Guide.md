# YVSH Stats Feature - Complete Implementation Guide

## 🎯 Project Overview
Create a personalized stats dashboard that shows fans their listening data specifically for YVSH tracks. Users connect their Spotify account and see fun, engaging metrics about their YVSH listening habits.

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Environment Setup](#environment-setup)
3. [Spotify API Configuration](#spotify-api-configuration)
4. [Backend Implementation](#backend-implementation)
5. [Database Schema](#database-schema)
6. [Frontend Components](#frontend-components)
7. [API Routes](#api-routes)
8. [Security Considerations](#security-considerations)
9. [Deployment](#deployment)
10. [Testing Strategy](#testing-strategy)
11. [Future Enhancements](#future-enhancements)

## 🏗️ Architecture Overview

### Tech Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, Node.js
- **Database**: Vercel KV (Redis) for sessions, optional PostgreSQL for analytics
- **Authentication**: Spotify OAuth 2.0
- **Deployment**: Vercel
- **APIs**: Spotify Web API

### Data Flow
```
User clicks "View My YVSH Stats" 
→ Spotify OAuth flow 
→ Fetch user's listening data 
→ Filter for YVSH tracks 
→ Calculate personalized stats 
→ Display animated dashboard 
→ Optional: Save anonymized analytics
```

## 🔧 Environment Setup

### Required Environment Variables
Create `.env.local` file:
```env
# Spotify API Credentials (get from Spotify Developer Dashboard)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://yvshmusic.com/api/auth/spotify/callback

# Database (Vercel KV)
KV_URL=your_vercel_kv_url
KV_REST_API_URL=your_vercel_kv_rest_api_url
KV_REST_API_TOKEN=your_vercel_kv_rest_api_token
KV_REST_API_READ_ONLY_TOKEN=your_vercel_kv_read_only_token

# Security
JWT_SECRET=your_super_secret_jwt_key
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://yvshmusic.com

# YVSH Artist Configuration
YVSH_ARTIST_ID=your_spotify_artist_id_when_available
YVSH_ARTIST_NAME=YVSH
```

### Package Dependencies
```json
{
  "dependencies": {
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.3.0",
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "framer-motion": "^11.0.0",
    "jsonwebtoken": "^9.0.2",
    "@types/jsonwebtoken": "^9.0.5",
    "axios": "^1.6.0",
    "@vercel/kv": "^1.0.0",
    "date-fns": "^3.3.0",
    "lucide-react": "^0.344.0"
  }
}
```

## 🎵 Spotify API Configuration

### 1. Create Spotify App (When Ready)
```markdown
1. Go to https://developer.spotify.com/dashboard
2. Create new app: "YVSH Stats Dashboard"
3. App description: "Personalized listening stats for YVSH fans"
4. Website: https://yvshmusic.com
5. Redirect URI: https://yvshmusic.com/api/auth/spotify/callback
6. APIs used: Web API
7. Save Client ID and Client Secret
```

### 2. Required Spotify Scopes
```typescript
const SPOTIFY_SCOPES = [
  'user-read-recently-played',    // Last 50 tracks
  'user-top-read',               // Top tracks/artists
  'user-read-private',           // User profile info
];
```

### 3. Spotify API Endpoints We'll Use
```typescript
// API endpoints for data fetching
const SPOTIFY_ENDPOINTS = {
  RECENTLY_PLAYED: 'https://api.spotify.com/v1/me/player/recently-played?limit=50',
  TOP_TRACKS_4_WEEKS: 'https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=50',
  TOP_TRACKS_6_MONTHS: 'https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=50',
  TOP_TRACKS_ALL_TIME: 'https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50',
  TOP_ARTISTS: 'https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=50',
  USER_PROFILE: 'https://api.spotify.com/v1/me',
};
```

## 🖥️ Backend Implementation

### 1. Spotify OAuth Handler
`pages/api/auth/spotify.ts`
```typescript
import { NextApiRequest, NextApiResponse } from 'next';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SCOPES = [
  'user-read-recently-played',
  'user-top-read', 
  'user-read-private'
].join(' ');

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = Math.random().toString(36).substring(7);
  
  const authURL = new URL(SPOTIFY_AUTH_URL);
  authURL.searchParams.append('response_type', 'code');
  authURL.searchParams.append('client_id', process.env.SPOTIFY_CLIENT_ID!);
  authURL.searchParams.append('scope', SCOPES);
  authURL.searchParams.append('redirect_uri', process.env.SPOTIFY_REDIRECT_URI!);
  authURL.searchParams.append('state', state);
  
  // Store state in session for security
  res.setHeader('Set-Cookie', `spotify_auth_state=${state}; HttpOnly; Secure; SameSite=Strict; Max-Age=300`);
  
  res.redirect(authURL.toString());
}
```

### 2. OAuth Callback Handler
`pages/api/auth/spotify/callback.ts`
```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { kv } from '@vercel/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect('/stats?error=access_denied');
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      throw new Error(tokens.error_description);
    }
    
    // Get user profile
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const profile = await profileResponse.json();
    
    // Create session token
    const sessionToken = jwt.sign(
      { 
        spotifyId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000)
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    
    // Store in KV for session management
    await kv.setex(`session:${profile.id}`, 3600, sessionToken);
    
    res.setHeader('Set-Cookie', `yvsh_stats_session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
    res.redirect('/stats?success=true');
    
  } catch (error) {
    console.error('Spotify callback error:', error);
    res.redirect('/stats?error=auth_failed');
  }
}
```

### 3. Stats Data Fetcher
`pages/api/stats/spotify.ts`
```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { calculateYvshStats } from '../../../lib/statsCalculator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const sessionToken = req.cookies.yvsh_stats_session;
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'No session found' });
    }
    
    const session = jwt.verify(sessionToken, process.env.JWT_SECRET!) as any;
    
    // Check if token expired, refresh if needed
    if (Date.now() >= session.expiresAt) {
      // Implement token refresh logic here
      return res.status(401).json({ error: 'Session expired' });
    }
    
    // Fetch all required data from Spotify
    const [recentlyPlayed, topTracks4Weeks, topTracks6Months, topTracksAllTime] = await Promise.all([
      fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
        headers: { 'Authorization': `Bearer ${session.accessToken}` }
      }).then(r => r.json()),
      
      fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=50', {
        headers: { 'Authorization': `Bearer ${session.accessToken}` }
      }).then(r => r.json()),
      
      fetch('https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=50', {
        headers: { 'Authorization': `Bearer ${session.accessToken}` }
      }).then(r => r.json()),
      
      fetch('https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50', {
        headers: { 'Authorization': `Bearer ${session.accessToken}` }
      }).then(r => r.json())
    ]);
    
    // Calculate YVSH-specific stats
    const yvshStats = calculateYvshStats({
      recentlyPlayed,
      topTracks4Weeks,
      topTracks6Months,
      topTracksAllTime
    });
    
    res.json(yvshStats);
    
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
```

### 4. Stats Calculator Library
`lib/statsCalculator.ts`
```typescript
interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string; id: string }[];
  album: { name: string; images: { url: string }[] };
  played_at?: string;
}

interface YvshStats {
  isYvshFan: boolean;
  mostPlayedSong: string | null;
  firstDiscoveryDate: string | null;
  totalYvshTracks: number;
  fanLevel: 'casual' | 'regular' | 'superfan' | 'obsessed';
  peakListeningHour: number | null;
  favoriteAlbum: string | null;
  recentStreaks: number;
  topYvshTracks: SpotifyTrack[];
  listeningPersonality: string;
}

export function calculateYvshStats(data: {
  recentlyPlayed: any;
  topTracks4Weeks: any;
  topTracks6Months: any;
  topTracksAllTime: any;
}): YvshStats {
  const YVSH_ARTIST_NAME = process.env.YVSH_ARTIST_NAME || 'YVSH';
  
  // Filter for YVSH tracks across all data
  const yvshTracks = {
    recent: filterYvshTracks(data.recentlyPlayed.items || []),
    top4Weeks: filterYvshTracks(data.topTracks4Weeks.items || []),
    top6Months: filterYvshTracks(data.topTracks6Months.items || []),
    topAllTime: filterYvshTracks(data.topTracksAllTime.items || [])
  };
  
  // Calculate metrics
  const totalYvshTracks = new Set([
    ...yvshTracks.recent.map(t => t.track?.id || t.id),
    ...yvshTracks.top4Weeks.map(t => t.id),
    ...yvshTracks.top6Months.map(t => t.id),
    ...yvshTracks.topAllTime.map(t => t.id)
  ]).size;
  
  const isYvshFan = totalYvshTracks > 0;
  
  // Most played song (highest ranking in any top tracks list)
  const mostPlayedSong = yvshTracks.top4Weeks[0]?.name || 
                        yvshTracks.top6Months[0]?.name || 
                        yvshTracks.topAllTime[0]?.name || 
                        null;
  
  // First discovery (earliest play in recent tracks)
  const firstDiscoveryDate = yvshTracks.recent.length > 0 
    ? yvshTracks.recent[yvshTracks.recent.length - 1].played_at 
    : null;
  
  // Fan level calculation
  const fanLevel = calculateFanLevel(totalYvshTracks, yvshTracks);
  
  // Peak listening hour
  const peakListeningHour = calculatePeakHour(yvshTracks.recent);
  
  // Favorite album
  const favoriteAlbum = calculateFavoriteAlbum(yvshTracks);
  
  // Recent streaks (consecutive days with YVSH plays)
  const recentStreaks = calculateStreaks(yvshTracks.recent);
  
  // Top YVSH tracks (deduplicated and ranked)
  const topYvshTracks = [
    ...yvshTracks.top4Weeks.slice(0, 3),
    ...yvshTracks.top6Months.slice(0, 2)
  ].slice(0, 5);
  
  // Listening personality
  const listeningPersonality = generateListeningPersonality(yvshTracks, peakListeningHour);
  
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
    listeningPersonality
  };
}

function filterYvshTracks(tracks: any[]): any[] {
  const YVSH_ARTIST_NAME = process.env.YVSH_ARTIST_NAME || 'YVSH';
  
  return tracks.filter(item => {
    const track = item.track || item;
    return track.artists?.some((artist: any) => 
      artist.name.toLowerCase() === YVSH_ARTIST_NAME.toLowerCase()
    );
  });
}

function calculateFanLevel(totalTracks: number, yvshTracks: any): 'casual' | 'regular' | 'superfan' | 'obsessed' {
  if (totalTracks === 0) return 'casual';
  if (totalTracks >= 5 && yvshTracks.top4Weeks.length > 0) return 'obsessed';
  if (totalTracks >= 3 || yvshTracks.top6Months.length > 1) return 'superfan';
  if (totalTracks >= 2) return 'regular';
  return 'casual';
}

function calculatePeakHour(recentTracks: any[]): number | null {
  if (recentTracks.length === 0) return null;
  
  const hourCounts: { [hour: number]: number } = {};
  
  recentTracks.forEach(item => {
    const hour = new Date(item.played_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  const peakHour = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)[0];
    
  return peakHour ? parseInt(peakHour[0]) : null;
}

function calculateFavoriteAlbum(yvshTracks: any): string | null {
  const albumCounts: { [album: string]: number } = {};
  
  [...yvshTracks.recent, ...yvshTracks.top6Months].forEach(item => {
    const track = item.track || item;
    const albumName = track.album?.name;
    if (albumName) {
      albumCounts[albumName] = (albumCounts[albumName] || 0) + 1;
    }
  });
  
  const favoriteAlbum = Object.entries(albumCounts)
    .sort(([,a], [,b]) => b - a)[0];
    
  return favoriteAlbum ? favoriteAlbum[0] : null;
}

function calculateStreaks(recentTracks: any[]): number {
  if (recentTracks.length === 0) return 0;
  
  const playDates = recentTracks
    .map(item => new Date(item.played_at).toDateString())
    .filter((date, index, arr) => arr.indexOf(date) === index)
    .sort();
  
  let streak = 1;
  let currentStreak = 1;
  
  for (let i = 1; i < playDates.length; i++) {
    const currentDate = new Date(playDates[i]);
    const prevDate = new Date(playDates[i-1]);
    const daysDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24);
    
    if (daysDiff === 1) {
      currentStreak++;
      streak = Math.max(streak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  
  return streak;
}

function generateListeningPersonality(yvshTracks: any, peakHour: number | null): string {
  if (yvshTracks.recent.length === 0) return 'Curious Explorer';
  
  const personalities = [
    { condition: peakHour && peakHour >= 22, text: 'Night Owl YVSH Listener' },
    { condition: peakHour && peakHour <= 6, text: 'Early Bird YVSH Fan' },
    { condition: yvshTracks.top4Weeks.length > 2, text: 'YVSH Repeat Champion' },
    { condition: yvshTracks.recent.length > 10, text: 'YVSH Discovery Machine' },
    { condition: true, text: 'Dedicated YVSH Supporter' }
  ];
  
  return personalities.find(p => p.condition)?.text || 'YVSH Enthusiast';
}
```

## 🎨 Frontend Components

### 1. Stats Page Component
`pages/stats.tsx`
```typescript
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Music, Calendar, Clock, Trophy, Headphones } from 'lucide-react';

interface YvshStats {
  isYvshFan: boolean;
  mostPlayedSong: string | null;
  firstDiscoveryDate: string | null;
  totalYvshTracks: number;
  fanLevel: 'casual' | 'regular' | 'superfan' | 'obsessed';
  peakListeningHour: number | null;
  favoriteAlbum: string | null;
  recentStreaks: number;
  topYvshTracks: any[];
  listeningPersonality: string;
}

export default function StatsPage() {
  const [stats, setStats] = useState<YvshStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stats/spotify');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyConnect = () => {
    window.location.href = '/api/auth/spotify';
  };

  if (!stats && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-black to-black flex items-center justify-center">
        <motion.div 
          className="text-center space-y-6 max-w-md mx-auto p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white">Your YVSH Stats</h1>
            <p className="text-gray-300">
              Discover your personalized listening insights and see how deep your YVSH obsession goes
            </p>
          </div>
          
          <motion.button
            onClick={handleSpotifyConnect}
            className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-full font-semibold flex items-center gap-3 mx-auto transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Headphones className="w-5 h-5" />
            Connect Spotify
          </motion.button>
          
          <p className="text-sm text-gray-400">
            We only access your listening history to show YVSH stats
          </p>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-black to-black flex items-center justify-center">
        <motion.div 
          className="text-center space-y-4"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white">Analyzing your YVSH listening data...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md mx-auto p-8">
          <h2 className="text-2xl font-bold text-red-400">Oops!</h2>
          <p className="text-gray-300">{error}</p>
          <button 
            onClick={handleSpotifyConnect}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-full"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!stats?.isYvshFan) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900 via-black to-black flex items-center justify-center">
        <motion.div 
          className="text-center space-y-6 max-w-md mx-auto p-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2 className="text-3xl font-bold text-white">Not a YVSH fan yet?</h2>
          <p className="text-gray-300">
            We couldn't find any YVSH tracks in your listening history. Time to change that!
          </p>
          <motion.a
            href="https://open.spotify.com/artist/YOUR_ARTIST_ID"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-full font-semibold"
            whileHover={{ scale: 1.05 }}
          >
            Discover YVSH Music
          </motion.a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-black to-black">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-5xl font-bold text-white mb-4">Your YVSH Stats</h1>
          <p className="text-xl text-purple-300">{stats.listeningPersonality}</p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Fan Level */}
          <StatsCard
            icon={<Trophy className="w-8 h-8" />}
            title="Fan Level"
            value={stats.fanLevel.charAt(0).toUpperCase() + stats.fanLevel.slice(1)}
            color="text-yellow-400"
            delay={0.1}
          />

          {/* Most Played Song */}
          <StatsCard
            icon={<Music className="w-8 h-8" />}
            title="Most Played Song"
            value={stats.mostPlayedSong || 'Keep listening!'}
            color="text-green-400"
            delay={0.2}
          />

          {/* Total Tracks */}
          <StatsCard
            icon={<Headphones className="w-8 h-8" />}
            title="YVSH Tracks Played"
            value={stats.totalYvshTracks.toString()}
            color="text-blue-400"
            delay={0.3}
          />

          {/* Peak Hour */}
          <StatsCard
            icon={<Clock className="w-8 h-8" />}
            title="Peak Listening Hour"
            value={stats.peakListeningHour ? `${formatHour(stats.peakListeningHour)}` : 'Various'}
            color="text-purple-400"
            delay={0.4}
          />

          {/* Favorite Album */}
          <StatsCard
            icon={<Music className="w-8 h-8" />}
            title="Favorite Album"
            value={stats.favoriteAlbum || 'Exploring...'}
            color="text-pink-400"
            delay={0.5}
          />

          {/* Streak */}
          <StatsCard
            icon={<Calendar className="w-8 h-8" />}
            title="Listening Streak"
            value={`${stats.recentStreaks} days`}
            color="text-orange-400"
            delay={0.6}
          />
        </div>

        {/* Top Tracks */}
        {stats.topYvshTracks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-gray-900 rounded-lg p-6"
          >
            <h3 className="text-2xl font-bold text-white mb-6">Your Top YVSH Tracks</h3>
            <div className="space-y-4">
              {stats.topYvshTracks.slice(0, 5).map((track, index) => (
                <div key={track.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
                  <span className="text-2xl font-bold text-purple-400 w-8">
                    #{index + 1}
                  </span>
                  {track.album?.images?.[0] && (
                    <img 
                      src={track.album.images[0].url} 
                      alt={track.album.name}
                      className="w-12 h-12 rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-white font-semibold">{track.name}</p>
                    <p className="text-gray-400 text-sm">{track.album?.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Share Button */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-semibold hover:from-purple-700 hover:to-pink-700 transition-all">
            Share My YVSH Stats
          </button>
        </motion.div>
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ icon, title, value, color, delay }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      className="bg-gray-900 rounded-lg p-6 border border-gray-800"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ scale: 1.05 }}
    >
      <div className={`${color} mb-3`}>
        {icon}
      </div>
      <h3 className="text-gray-400 text-sm uppercase tracking-wide mb-1">
        {title}
      </h3>
      <p className="text-white text-2xl font-bold">
        {value}
      </p>
    </motion.div>
  );
}

// Helper function
function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}
```

### 2. Homepage Integration
Add this to your existing homepage component:
```typescript
// Add to your homepage component
<motion.div 
  className="mt-12 text-center"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.6 }}
>
  <Link 
    href="/stats"
    className="inline-flex items-center gap-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-semibold hover:from-purple-700 hover:to-pink-700 transition-all"
  >
    <BarChart3 className="w-5 h-5" />
    View My YVSH Stats
  </Link>
  <p className="text-gray-400 text-sm mt-2">
    See your personalized listening insights
  </p>
</motion.div>
```

## 🗄️ Database Schema (Optional Analytics)

If you want to store anonymized analytics:

```typescript
// lib/database.ts
import { kv } from '@vercel/kv';

interface AnonymousStats {
  timestamp: number;
  fanLevel: string;
  totalTracks: number;
  hasRecentActivity: boolean;
  peakHour: number | null;
}

export async function saveAnonymousStats(stats: AnonymousStats) {
  const key = `anonymous_stats:${Date.now()}:${Math.random().toString(36).substring(7)}`;
  await kv.setex(key, 86400 * 30, stats); // 30 days retention
}

export async function getStatsAnalytics() {
  const keys = await kv.keys('anonymous_stats:*');
  const stats = await Promise.all(keys.map(key => kv.get(key)));
  return stats.filter(Boolean);
}
```

## 🔐 Security Considerations

### 1. Token Security
- Store access tokens in secure HTTP-only cookies
- Implement token refresh logic
- Never expose tokens to client-side JavaScript

### 2. Rate Limiting
```typescript
// lib/rateLimit.ts
import { kv } from '@vercel/kv';

export async function rateLimit(identifier: string, limit: number = 10, window: number = 3600) {
  const key = `rate_limit:${identifier}`;
  const current = await kv.get(key) || 0;
  
  if (current >= limit) {
    throw new Error('Rate limit exceeded');
  }
  
  await kv.setex(key, window, current + 1);
}
```

### 3. Input Validation
```typescript
// lib/validation.ts
import { z } from 'zod';

export const spotifyTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
```

## 🚀 Deployment Checklist

### Vercel Deployment
1. **Environment Variables**: Set all required env vars in Vercel dashboard
2. **KV Database**: Create Vercel KV store and connect
3. **Domain**: Ensure redirect URI matches your domain
4. **Build Settings**: Verify Next.js build configuration

### Pre-Launch Testing
1. **OAuth Flow**: Test complete authentication process
2. **API Endpoints**: Verify all endpoints return expected data
3. **Error Handling**: Test error scenarios (no YVSH tracks, API failures)
4. **Mobile Responsive**: Test on various screen sizes
5. **Performance**: Check loading times and optimize if needed

## 🧪 Testing Strategy

### 1. Unit Tests
```typescript
// tests/statsCalculator.test.ts
import { calculateYvshStats } from '../lib/statsCalculator';

describe('Stats Calculator', () => {
  test('identifies YVSH fan correctly', () => {
    const mockData = {
      recentlyPlayed: { items: [mockYvshTrack] },
      topTracks4Weeks: { items: [] },
      topTracks6Months: { items: [] },
      topTracksAllTime: { items: [] }
    };
    
    const stats = calculateYvshStats(mockData);
    expect(stats.isYvshFan).toBe(true);
  });
});
```

### 2. Integration Tests
- Test Spotify OAuth flow
- Test API endpoint responses
- Test error handling

### 3. Manual Testing Scenarios
- New user with no YVSH tracks
- Casual fan with 1-2 YVSH tracks
- Superfan with multiple YVSH tracks
- User with expired session
- API failure scenarios

## 🔮 Future Enhancements

### Phase 2 Features
1. **Social Sharing**: Generate shareable stat images
2. **Leaderboards**: Anonymous fan level rankings
3. **Playlist Generation**: Auto-create YVSH playlists
4. **Push Notifications**: New release alerts for superfans
5. **Advanced Analytics**: More detailed listening patterns

### Phase 3 Features
1. **Apple Music Support**: Expand beyond Spotify
2. **Listening Goals**: Set and track listening targets
3. **Fan Rewards**: Unlock exclusive content based on listening
4. **Community Features**: Connect with other YVSH fans
5. **AI Insights**: Predictive listening recommendations

## 📚 Resources

### Documentation Links
- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api/)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [OAuth 2.0 Authorization Code Flow](https://tools.ietf.org/html/rfc6749#section-4.1)

### Development Tools
- [Spotify API Console](https://developer.spotify.com/console/) - Test API endpoints
- [JWT Debugger](https://jwt.io/) - Debug JWT tokens
- [Postman](https://www.postman.com/) - API testing
- [React DevTools](https://react.dev/learn/react-developer-tools) - Component debugging

---

## 🎉 Getting Started

1. **Set up environment variables** (mock values for now)
2. **Install dependencies** with `npm install`
3. **Build the UI components** and test with mock data
4. **Implement backend logic** with placeholder responses
5. **When ready**: Create Spotify app and replace mock values
6. **Test with real data** and refine the experience
7. **Deploy to Vercel** and celebrate! 🎵

---

*This implementation guide provides everything you need to build a world-class personalized stats dashboard for YVSH fans. The modular approach ensures you can build and test components independently, then seamlessly integrate with real Spotify data when ready.*
