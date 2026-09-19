/**
 * FocusTube - Serverless YouTube API Function
 * 
 * Securely resolves YouTube video and playlist metadata on Vercel.
 * Reads YOUTUBE_API_KEY from environment variables (never exposed to client).
 * Protected with per-IP rate limiting, request size capping, and ID validation.
 */

const { applyProtection } = require('./_lib/protection.js');

/**
 * Parses ISO 8601 duration (e.g. 'PT48M15S', 'PT1H2M34S', 'PT45S') to seconds
 */
function parseDurationToSeconds(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return (hours * 3600) + (minutes * 60) + seconds;
}

module.exports = async function handler(req, res) {
  // Apply protections: CORS, payload capping, per-IP rate limit, identifier validation
  const protection = applyProtection(req, res);
  if (!protection.ok) return;

  const { videoId, playlistId } = protection;
  const apiKey = process.env.YOUTUBE_API_KEY;

  try {
    // -------------------------------------------------------------
    // Case 1: Video Details Resolution
    // -------------------------------------------------------------
    if (videoId) {
      if (apiKey) {
        // Query YouTube Data API v3
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${encodeURIComponent(videoId)}&key=${apiKey}`;
        const ytRes = await fetch(apiUrl);

        if (ytRes.ok) {
          const ytData = await ytRes.json();
          const item = ytData.items && ytData.items[0];

          if (!item) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'Not Found',
              message: `Video '${videoId}' was not found or is private/deleted.`
            }));
            return;
          }

          const durationSec = parseDurationToSeconds(item.contentDetails?.duration);
          const snippet = item.snippet || {};
          const status = item.status || {};

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
          res.end(JSON.stringify({
            videoId,
            title: snippet.title || 'Untitled Lecture',
            channel: snippet.channelTitle || 'Unknown Channel',
            channelId: snippet.channelId || '',
            description: snippet.description || '',
            publishedAt: snippet.publishedAt || '',
            durationSec,
            durationFormatted: item.contentDetails?.duration || '',
            thumbnails: {
              default: snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${videoId}/default.jpg`,
              medium: snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
              high: snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              maxres: snippet.thumbnails?.maxres?.url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
            },
            isEmbeddable: status.embeddable !== false,
            privacyStatus: status.privacyStatus || 'public',
            source: 'youtube_v3'
          }));
          return;
        } else {
          console.warn(`[API:YouTube] YouTube v3 API returned ${ytRes.status}, falling back to oEmbed`);
        }
      }

      // Fallback: YouTube oEmbed endpoint (requires zero API keys, validates embedding)
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
      const oembedRes = await fetch(oembedUrl);

      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=43200');
        res.end(JSON.stringify({
          videoId,
          title: oembedData.title || 'YouTube Lecture',
          channel: oembedData.author_name || 'YouTube Creator',
          channelUrl: oembedData.author_url || '',
          durationSec: 0,
          thumbnails: {
            default: oembedData.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/default.jpg`,
            high: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            maxres: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
          },
          isEmbeddable: true,
          source: 'oembed_fallback'
        }));
        return;
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Video Unavailable',
        message: `Video '${videoId}' cannot be played or does not allow embedding.`
      }));
      return;
    }

    // -------------------------------------------------------------
    // Case 2: Playlist Resolution
    // -------------------------------------------------------------
    if (playlistId) {
      if (!apiKey) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'Configuration Required',
          message: 'YOUTUBE_API_KEY environment variable is required to resolve YouTube playlists.'
        }));
        return;
      }

      const listUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;
      const listRes = await fetch(listUrl);

      if (!listRes.ok) {
        res.statusCode = listRes.status === 404 ? 404 : 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'Playlist Lookup Failed',
          message: `Could not retrieve playlist '${playlistId}'. It may be private or invalid.`
        }));
        return;
      }

      const listData = await listRes.json();
      const items = (listData.items || []).map((item, idx) => ({
        index: idx + 1,
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title || 'Untitled',
        channel: item.snippet?.channelTitle || '',
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || ''
      })).filter(item => Boolean(item.videoId));

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.end(JSON.stringify({
        playlistId,
        totalItems: items.length,
        items,
        source: 'youtube_v3'
      }));
      return;
    }

  } catch (err) {
    console.error('[API:YouTube] Internal error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to process YouTube request.'
    }));
  }
};
