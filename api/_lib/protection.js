/**
 * FocusTube - Serverless API Protection Middleware
 * 
 * Provides:
 * 1. Input validation (enforces presence of valid videoId or playlistId)
 * 2. Request payload size capping (rejects payloads > 32KB with HTTP 413)
 * 3. In-memory sliding-window per-IP rate limiting (rejects requests > limit with HTTP 429)
 * 4. Safe CORS headers and OPTIONS preflight handling
 */

// Rate limiting state: Map of IP -> array of request timestamps
const rateLimitMap = new Map();

// Configuration
const MAX_PAYLOAD_BYTES = 32 * 1024; // 32 KB maximum request size
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute per IP

// Regular expressions for YouTube IDs and Lecture IDs
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;
const PLAYLIST_ID_REGEX = /^[a-zA-Z0-9_-]{12,64}$/;

/**
 * Clean up stale rate limit entries older than the window
 */
function pruneRateLimitMap(windowMs) {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const validTimestamps = timestamps.filter(t => (now - t) < windowMs);
    if (validTimestamps.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, validTimestamps);
    }
  }
}

/**
 * Extracts client IP address from standard reverse proxy and socket headers
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Return the first IP in the comma-separated X-Forwarded-For list
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Sets standard CORS headers and responds to OPTIONS preflight
 * Returns true if the request was an OPTIONS preflight and was handled.
 */
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

/**
 * Enforces payload size capping.
 * Returns true if payload size is within limits, false if rejected (sends 413).
 */
function capRequestSize(req, res, maxBytes = MAX_PAYLOAD_BYTES) {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Payload Too Large',
      message: `Request size exceeds maximum allowed limit of ${maxBytes} bytes.`
    }));
    return false;
  }

  // Also verify body length if body is a string or Buffer
  if (req.body) {
    let bodySize = 0;
    if (typeof req.body === 'string') {
      bodySize = Buffer.byteLength(req.body, 'utf8');
    } else if (Buffer.isBuffer(req.body)) {
      bodySize = req.body.length;
    } else if (typeof req.body === 'object') {
      bodySize = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    }

    if (bodySize > maxBytes) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Payload Too Large',
        message: `Request body exceeds maximum allowed limit of ${maxBytes} bytes.`
      }));
      return false;
    }
  }

  return true;
}

/**
 * Enforces in-memory sliding-window per-IP rate limiting.
 * Returns true if request is permitted, false if rate limited (sends 429).
 */
function checkRateLimit(req, res, options = {}) {
  const windowMs = options.windowMs || DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.max || DEFAULT_MAX_REQUESTS_PER_WINDOW;

  const clientIp = getClientIp(req);
  const now = Date.now();

  // Periodically clean stale entries
  if (Math.random() < 0.05) {
    pruneRateLimitMap(windowMs);
  }

  const existingTimestamps = rateLimitMap.get(clientIp) || [];
  const validTimestamps = existingTimestamps.filter(t => (now - t) < windowMs);

  const remaining = Math.max(0, maxRequests - validTimestamps.length - 1);
  const resetSec = Math.ceil(windowMs / 1000);

  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', (Math.floor(now / 1000) + resetSec).toString());

  if (validTimestamps.length >= maxRequests) {
    res.statusCode = 429;
    res.setHeader('Retry-After', resetSec.toString());
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      message: `Rate limit exceeded (${maxRequests} requests per minute). Please try again in ${resetSec} seconds.`
    }));
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(clientIp, validTimestamps);
  return true;
}

/**
 * Validates that either videoId or playlistId is provided and correctly formatted.
 * Returns { valid: true, videoId, playlistId } or { valid: false, error: string }.
 */
function validateIdentifier(req) {
  // Query parameters or parsed JSON body
  const query = req.query || {};
  let body = {};
  if (req.body) {
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); } catch (e) {}
    } else if (typeof req.body === 'object') {
      body = req.body;
    }
  }

  const videoId = (query.videoId || body.videoId || query.v || body.v || '').trim();
  const playlistId = (query.playlistId || body.playlistId || query.list || body.list || '').trim();

  // Rule: Reject requests without videoId or playlistId
  if (!videoId && !playlistId) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Missing required identifier: videoId or playlistId must be provided.'
    };
  }

  // If videoId is provided, validate 11-char pattern
  if (videoId && !VIDEO_ID_REGEX.test(videoId)) {
    return {
      valid: false,
      statusCode: 400,
      error: `Invalid videoId format. Expected alphanumeric characters (3-32 chars), received '${videoId}'.`
    };
  }

  // If playlistId is provided, validate playlist pattern
  if (playlistId && !PLAYLIST_ID_REGEX.test(playlistId)) {
    return {
      valid: false,
      statusCode: 400,
      error: `Invalid playlistId format. Received '${playlistId}'.`
    };
  }

  return {
    valid: true,
    videoId: videoId || null,
    playlistId: playlistId || null
  };
}

/**
 * Convenience helper to apply all protection checks in sequence.
 * Returns { ok: true, videoId, playlistId } or { ok: false } if request was terminated.
 */
function applyProtection(req, res, options = {}) {
  // 1. CORS & OPTIONS
  if (handleCors(req, res)) {
    return { ok: false };
  }

  // 2. Request payload size capping
  if (!capRequestSize(req, res, options.maxBytes)) {
    return { ok: false };
  }

  // 3. Per-IP rate limiting
  if (!checkRateLimit(req, res, options.rateLimit)) {
    return { ok: false };
  }

  // 4. Identifier validation (must have videoId or playlistId)
  const validation = validateIdentifier(req);
  if (!validation.valid) {
    res.statusCode = validation.statusCode || 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Validation Error',
      message: validation.error
    }));
    return { ok: false };
  }

  return {
    ok: true,
    videoId: validation.videoId,
    playlistId: validation.playlistId
  };
}

module.exports = {
  handleCors,
  capRequestSize,
  checkRateLimit,
  validateIdentifier,
  applyProtection,
  getClientIp,
  MAX_PAYLOAD_BYTES,
  DEFAULT_MAX_REQUESTS_PER_WINDOW
};
