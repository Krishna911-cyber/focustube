/**
 * FocusTube - Serverless YouTube Playlist Importer Function
 * 
 * Given a playlist URL or ID, calls YouTube Data API v3 playlistItems.list
 * (part=snippet,contentDetails, maxResults=50, follows nextPageToken up to 25 videos total).
 * Returns [{ videoId, title, thumbnail, position }].
 * Skips private and deleted entries.
 * Returns friendly errors for YouTube Mix (RD...) and unavailable playlists.
 */

const { handleCors, capRequestSize, checkRateLimit } = require('./_lib/protection.js');

// Curated demo playlist fallback when running locally without YOUTUBE_API_KEY
const DEMO_PLAYLIST_FALLBACK = {
  playlistId: 'PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k',
  title: 'MIT 18.06 Linear Algebra, Spring 2005 (Selected Lectures)',
  totalCount: 4,
  items: [
    {
      position: 1,
      videoId: 'J7DzL2_Na80',
      title: 'Lecture 1: The Geometry of Linear Equations & Row Picture',
      channel: 'MIT OpenCourseWare',
      thumbnail: 'https://i.ytimg.com/vi/J7DzL2_Na80/hqdefault.jpg'
    },
    {
      position: 2,
      videoId: 'QVKj3LADCnA',
      title: 'Lecture 2: Elimination with Matrices & Operations',
      channel: 'MIT OpenCourseWare',
      thumbnail: 'https://i.ytimg.com/vi/QVKj3LADCnA/hqdefault.jpg'
    },
    {
      position: 3,
      videoId: 'FX4C-JpTFgY',
      title: 'Lecture 3: Multiplication and Inverse Matrices',
      channel: 'MIT OpenCourseWare',
      thumbnail: 'https://i.ytimg.com/vi/FX4C-JpTFgY/hqdefault.jpg'
    },
    {
      position: 4,
      videoId: 'fNk_zzaMoSs',
      title: 'Essence of Linear Algebra - Chapter 1: Vectors',
      channel: '3Blue1Brown',
      thumbnail: 'https://i.ytimg.com/vi/fNk_zzaMoSs/hqdefault.jpg'
    }
  ]
};

/**
 * Extracts a playlist ID from a URL or raw string.
 * Supports:
 * - youtube.com/playlist?list=ID
 * - youtube.com/watch?v=...&list=ID
 * - Bare playlist ID (e.g. "PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k")
 */
function extractPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  // Check for bare playlist ID: starts with PL, UU, FL, RD, etc. (12 to 64 chars)
  if (/^[a-zA-Z0-9_-]{12,64}$/.test(str)) {
    return str;
  }

  try {
    const hasProtocol = /^https?:\/\//i.test(str);
    const url = new URL(hasProtocol ? str : `https://${str}`);
    const listParam = url.searchParams.get('list');
    if (listParam && /^[a-zA-Z0-9_-]{12,64}$/.test(listParam)) {
      return listParam;
    }
  } catch (e) {
    // If URL parsing fails, return null
  }

  return null;
}

/**
 * Checks if a playlist ID is a YouTube Mix (auto-generated algorithmic radio)
 */
function isMixPlaylist(playlistId) {
  if (!playlistId) return false;
  // Mix playlists typically start with "RD", "RDCLAK", or "UL"
  return /^RD/i.test(playlistId) || /^UL/i.test(playlistId);
}

module.exports = async function handler(req, res) {
  // 1. CORS & Preflight
  if (handleCors(req, res)) return;

  // 2. Request payload size cap (32KB)
  if (!capRequestSize(req, res)) return;

  // 3. Per-IP rate limit (30 req/min)
  if (!checkRateLimit(req, res)) return;

  // Extract input parameter
  const query = req.query || {};
  let body = {};
  if (req.body) {
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch (e) {}
    } else if (typeof req.body === 'object') {
      body = req.body;
    }
  }

  const rawInput = query.playlistId || body.playlistId || query.url || body.url || query.list || body.list || '';
  const playlistId = extractPlaylistId(rawInput);

  // Validation: Missing playlist identifier
  if (!playlistId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Validation Error',
      message: 'A valid YouTube playlist URL or playlist ID must be provided.'
    }));
    return;
  }

  // Friendly error for Mix playlists (RD...)
  if (isMixPlaylist(playlistId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Mix Playlist Not Supported',
      message: 'YouTube Mix playlists are auto-generated dynamic radio streams that cannot be imported. Please use a standard YouTube playlist (starts with "PL...").'
    }));
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  try {
    // If no API key configured, provide clean fallback in development
    if (!apiKey) {
      console.warn('[API:Playlist] YOUTUBE_API_KEY not set. Returning demo curriculum fallback.');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=43200');
      res.end(JSON.stringify({
        ...DEMO_PLAYLIST_FALLBACK,
        playlistId,
        note: 'Serving demo lecture playlist. Set YOUTUBE_API_KEY in .env to query live YouTube playlists.'
      }));
      return;
    }

    // Call YouTube Data API v3 playlistItems.list
    // part=snippet,contentDetails, maxResults=50, follow nextPageToken up to 25 videos total
    const MAX_VIDEOS = 25;
    const items = [];
    let nextPageToken = null;
    let playlistTitle = 'YouTube Study Playlist';

    do {
      let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;
      if (nextPageToken) {
        url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
      }

      const apiRes = await fetch(url);

      if (!apiRes.ok) {
        if (apiRes.status === 404) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'Playlist Not Found',
            message: `Playlist '${playlistId}' was not found. It may be private, unlisted without link access, or deleted.`
          }));
          return;
        }

        const errText = await apiRes.text();
        console.error(`[API:Playlist] YouTube API error (${apiRes.status}):`, errText);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'YouTube API Error',
          message: 'Unable to retrieve playlist from YouTube. Please check the playlist privacy settings.'
        }));
        return;
      }

      const data = await apiRes.json();
      nextPageToken = data.nextPageToken || null;

      const rawItems = data.items || [];
      for (const item of rawItems) {
        const snippet = item.snippet || {};
        const title = snippet.title || '';
        const videoId = snippet.resourceId?.videoId;

        // Skip private and deleted entries
        if (!videoId || title === 'Private video' || title === 'Deleted video') {
          continue;
        }

        items.push({
          position: items.length + 1,
          videoId: videoId,
          title: title,
          channel: snippet.channelTitle || '',
          thumbnail: snippet.thumbnails?.medium?.url ||
                     snippet.thumbnails?.high?.url ||
                     snippet.thumbnails?.default?.url ||
                     `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        });

        if (items.length >= MAX_VIDEOS) {
          break;
        }
      }

    } while (nextPageToken && items.length < MAX_VIDEOS);

    if (items.length === 0) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Empty Playlist',
        message: 'This playlist contains no available or public videos to study.'
      }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.end(JSON.stringify({
      playlistId,
      title: playlistTitle,
      totalCount: items.length,
      items
    }));

  } catch (err) {
    console.error('[API:Playlist] Internal error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to process playlist request.'
    }));
  }
};

// Export helpers for unit testing
module.exports.extractPlaylistId = extractPlaylistId;
module.exports.isMixPlaylist = isMixPlaylist;
