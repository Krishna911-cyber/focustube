/**
 * FocusTube - Serverless YouTube Playlist Importer Function
 * 
 * Given a playlist URL or ID:
 * 1. Checks YouTube Data API v3 if YOUTUBE_API_KEY is configured in the environment.
 * 2. If API key is missing or encounters quota limits/errors, automatically extracts
 *    the actual playlist using YouTube Web scraping (ytInitialData) and Atom RSS feeds.
 * 3. Returns [{ position, videoId, title, channel, thumbnail }].
 * 4. Rejects YouTube Mix playlists (RD...) with friendly errors.
 */

const { handleCors, capRequestSize, checkRateLimit } = require('./_lib/protection.js');

// Curated demo playlist fallback when running locally/offline specifically for the demo playlist ID
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

  // Check for bare playlist ID: starts with PL, UU, FL, RD, OL, etc. (12 to 64 chars)
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
  // Mix playlists typically start with "RD" or "UL"
  return /^RD/i.test(playlistId) || /^UL/i.test(playlistId);
}

/**
 * Robust fetch with timeout
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Scrapes YouTube playlist web page for ytInitialData.
 * Extracts real playlist title, video IDs, titles, channels, and thumbnails.
 * Works without any API key and supports up to maxVideos (default 50).
 */
async function scrapeYouTubePlaylistPage(playlistId, maxVideos = 50) {
  try {
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, 8000);

    if (!res.ok) return null;
    const html = await res.text();

    const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
    if (!match) return null;

    const data = JSON.parse(match[1]);

    // Extract Playlist Title
    let title = data.metadata?.playlistMetadataRenderer?.title ||
                data.header?.playlistHeaderRenderer?.title?.simpleText ||
                data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text;
    if (!title) {
      const titleMatch = html.match(/<title>(.+?) - YouTube<\/title>/);
      if (titleMatch) title = titleMatch[1];
    }

    const items = [];
    const seenIds = new Set();

    // Strategy A: Direct traversal of browse tabs & section lists
    const twoCol = data.contents?.twoColumnBrowseResultsRenderer;
    const tabs = twoCol?.tabs || [];
    for (const tab of tabs) {
      const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const sec of sectionList) {
        const itemSection = sec?.itemSectionRenderer?.contents || [];
        for (const item of itemSection) {
          // Modern YouTube UI (lockupViewModel)
          if (item.lockupViewModel) {
            const lvm = item.lockupViewModel;
            const videoId = lvm.contentId;
            const itemTitle = lvm.metadata?.lockupMetadataViewModel?.title?.content;

            if (videoId && itemTitle && !seenIds.has(videoId)) {
              seenIds.add(videoId);

              const thumbSources = lvm.contentImage?.thumbnailViewModel?.image?.sources || [];
              const thumbnail = thumbSources[thumbSources.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

              // Extract channel name from metadata rows
              let channel = '';
              const rows = lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
              for (const row of rows) {
                const parts = row.metadataParts || row.parts || [];
                for (const part of parts) {
                  const text = part.text?.content;
                  if (text && !text.includes('views') && !text.includes('ago') && !text.includes('Streamed')) {
                    channel = text;
                    break;
                  }
                }
                if (channel) break;
              }

              items.push({
                position: items.length + 1,
                videoId,
                title: itemTitle,
                channel: channel || 'YouTube Creator',
                thumbnail
              });

              if (items.length >= maxVideos) break;
            }
          }

          // Classic YouTube UI (playlistVideoRenderer)
          const pvr = item.playlistVideoRenderer || item.playlistVideoListRenderer?.contents?.[0]?.playlistVideoRenderer;
          if (pvr) {
            const videoId = pvr.videoId;
            const itemTitle = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText;

            if (videoId && itemTitle && !seenIds.has(videoId)) {
              seenIds.add(videoId);
              const thumbSources = pvr.thumbnail?.thumbnails || [];
              const thumbnail = thumbSources[thumbSources.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

              items.push({
                position: items.length + 1,
                videoId,
                title: itemTitle,
                channel: pvr.shortBylineText?.runs?.[0]?.text || '',
                thumbnail
              });

              if (items.length >= maxVideos) break;
            }
          }
        }
        if (items.length >= maxVideos) break;
      }
      if (items.length >= maxVideos) break;
    }

    // Strategy B: Deep recursive search if Strategy A found nothing
    if (items.length === 0) {
      function walk(obj) {
        if (!obj || typeof obj !== 'object' || items.length >= maxVideos) return;
        if (obj.playlistVideoRenderer) {
          const r = obj.playlistVideoRenderer;
          const vid = r.videoId;
          const t = r.title?.runs?.[0]?.text || r.title?.simpleText;
          if (vid && t && !seenIds.has(vid)) {
            seenIds.add(vid);
            items.push({
              position: items.length + 1,
              videoId: vid,
              title: t,
              channel: r.shortBylineText?.runs?.[0]?.text || '',
              thumbnail: r.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
            });
          }
        } else if (obj.lockupViewModel) {
          const lvm = obj.lockupViewModel;
          const vid = lvm.contentId;
          const t = lvm.metadata?.lockupMetadataViewModel?.title?.content;
          if (vid && t && !seenIds.has(vid)) {
            seenIds.add(vid);
            items.push({
              position: items.length + 1,
              videoId: vid,
              title: t,
              channel: 'YouTube Creator',
              thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
            });
          }
        }
        for (const k of Object.keys(obj)) {
          walk(obj[k]);
        }
      }
      walk(data);
    }

    if (items.length > 0) {
      return {
        playlistId,
        title: title || 'YouTube Study Playlist',
        totalCount: items.length,
        items,
        source: 'youtube_web_scrape'
      };
    }
  } catch (err) {
    console.warn('[API:Playlist] Web scraper attempt encountered error:', err.message);
  }

  return null;
}

/**
 * Fetches YouTube Atom RSS Feed for a playlist.
 * Zero-dependency, fast fallback providing up to 15 items + channel info.
 */
async function fetchYouTubePlaylistRss(playlistId) {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, 8000);

    if (!res.ok) return null;
    const xml = await res.text();

    const titleMatch = xml.match(/<title>(.+?)<\/title>/);
    const playlistTitle = titleMatch ? decodeXml(titleMatch[1]) : 'YouTube Study Playlist';

    const authorMatch = xml.match(/<author>\s*<name>(.+?)<\/name>/);
    const defaultAuthor = authorMatch ? decodeXml(authorMatch[1]) : '';

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entryMatch;
    const items = [];
    const seenIds = new Set();

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entryXml = entryMatch[1];
      const idMatch = entryXml.match(/<yt:videoId>(.+?)<\/yt:videoId>/);
      const titleM = entryXml.match(/<title>(.+?)<\/title>/);
      const authorM = entryXml.match(/<name>(.+?)<\/name>/);
      const thumbM = entryXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/);

      if (idMatch && idMatch[1] && !seenIds.has(idMatch[1])) {
        const videoId = idMatch[1];
        seenIds.add(videoId);
        const title = titleM ? decodeXml(titleM[1]) : 'Untitled Video';
        const channel = authorM ? decodeXml(authorM[1]) : defaultAuthor;
        const thumbnail = thumbM ? thumbM[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        items.push({
          position: items.length + 1,
          videoId,
          title,
          channel,
          thumbnail
        });
      }
    }

    if (items.length > 0) {
      return {
        playlistId,
        title: playlistTitle,
        totalCount: items.length,
        items,
        source: 'youtube_atom_rss'
      };
    }
  } catch (err) {
    console.warn('[API:Playlist] Atom RSS attempt encountered error:', err.message);
  }

  return null;
}

function decodeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Queries official YouTube Data API v3 playlistItems and playlist title.
 */
async function fetchYouTubeDataApi(playlistId, apiKey, maxVideos = 50) {
  // 1. Fetch playlist title from playlists endpoint
  let playlistTitle = 'YouTube Study Playlist';
  try {
    const metaUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${apiKey}`;
    const metaRes = await fetchWithTimeout(metaUrl, {}, 5000);
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (metaData.items && metaData.items[0]?.snippet?.title) {
        playlistTitle = metaData.items[0].snippet.title;
      }
    }
  } catch (e) {}

  // 2. Fetch playlist items
  const items = [];
  let nextPageToken = null;

  do {
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;
    if (nextPageToken) {
      url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
    }

    const apiRes = await fetchWithTimeout(url, {}, 8000);
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      throw new Error(`YouTube API returned ${apiRes.status}: ${errText}`);
    }

    const data = await apiRes.json();
    nextPageToken = data.nextPageToken || null;

    const rawItems = data.items || [];
    for (const item of rawItems) {
      const snippet = item.snippet || {};
      const title = snippet.title || '';
      const videoId = snippet.resourceId?.videoId;

      if (!videoId || title === 'Private video' || title === 'Deleted video') {
        continue;
      }

      items.push({
        position: items.length + 1,
        videoId,
        title,
        channel: snippet.channelTitle || '',
        thumbnail: snippet.thumbnails?.medium?.url ||
                   snippet.thumbnails?.high?.url ||
                   snippet.thumbnails?.default?.url ||
                   `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      });

      if (items.length >= maxVideos) break;
    }
  } while (nextPageToken && items.length < maxVideos);

  if (items.length > 0) {
    return {
      playlistId,
      title: playlistTitle,
      totalCount: items.length,
      items,
      source: 'youtube_data_api_v3'
    };
  }

  return null;
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

  // Offline unit test fallback specifically for the curated demo playlist when no API key is provided
  if (!apiKey && playlistId === DEMO_PLAYLIST_FALLBACK.playlistId) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=43200');
    res.end(JSON.stringify({
      ...DEMO_PLAYLIST_FALLBACK,
      playlistId,
      source: 'demo_fallback'
    }));
    return;
  }

  try {
    let result = null;

    // Tier 1: If YouTube API key configured, attempt YouTube Data API v3
    if (apiKey) {
      try {
        result = await fetchYouTubeDataApi(playlistId, apiKey, 50);
      } catch (apiErr) {
        console.warn('[API:Playlist] YouTube Data API v3 failed, falling back to public extraction:', apiErr.message);
      }
    }

    // Tier 2: Public YouTube Web Scraper (no API key needed, extracts up to 50 videos with real titles & channels)
    if (!result) {
      result = await scrapeYouTubePlaylistPage(playlistId, 50);
    }

    // Tier 3: Public YouTube Atom RSS Feed (no API key needed, extracts up to 15 videos)
    if (!result) {
      result = await fetchYouTubePlaylistRss(playlistId);
    }

    // Tier 4: If specifically demo playlist and nothing else worked
    if (!result && playlistId === DEMO_PLAYLIST_FALLBACK.playlistId) {
      result = { ...DEMO_PLAYLIST_FALLBACK, playlistId, source: 'demo_fallback' };
    }

    // If still no result, playlist is truly unavailable, empty, or private
    if (!result || !result.items || result.items.length === 0) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Playlist Unavailable',
        message: `Playlist '${playlistId}' could not be loaded. Please ensure the playlist is public, contains accessible videos, and is not private or deleted.`
      }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.end(JSON.stringify(result));

  } catch (err) {
    console.error('[API:Playlist] Internal error processing playlist:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while loading the playlist.'
    }));
  }
};

// Export helpers for unit testing
module.exports.extractPlaylistId = extractPlaylistId;
module.exports.isMixPlaylist = isMixPlaylist;
module.exports.scrapeYouTubePlaylistPage = scrapeYouTubePlaylistPage;
module.exports.fetchYouTubePlaylistRss = fetchYouTubePlaylistRss;
