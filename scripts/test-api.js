/**
 * FocusTube - Serverless API Test Suite
 * 
 * Verifies:
 * 1. Missing identifier rejection (HTTP 400)
 * 2. Invalid identifier formatting rejection (HTTP 400)
 * 3. Request payload size capping (HTTP 413)
 * 4. Per-IP rate limiting (HTTP 429)
 * 5. Secret safety (API keys never leaked in output)
 * 6. Execution of /api/youtube and /api/quiz handlers
 */

const assert = require('assert');
const {
  applyProtection,
  capRequestSize,
  checkRateLimit,
  validateIdentifier,
  MAX_PAYLOAD_BYTES
} = require('../api/_lib/protection.js');

const youtubeHandler = require('../api/youtube.js');
const quizHandler = require('../api/quiz.js');

// Helper to create mock request and response objects
function createMockHttp(options = {}) {
  const req = {
    method: options.method || 'GET',
    headers: {
      'x-forwarded-for': options.ip || '192.168.1.100',
      'content-type': 'application/json',
      ...options.headers
    },
    query: options.query || {},
    body: options.body || null,
    socket: { remoteAddress: options.ip || '192.168.1.100' }
  };

  const res = {
    statusCode: 200,
    headers: {},
    bodyData: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(data) {
      if (data) this.bodyData += data;
    },
    json() {
      try {
        return JSON.parse(this.bodyData);
      } catch (e) {
        return null;
      }
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('========================================================');
  console.log('FocusTube - Serverless API & Protection Test Suite');
  console.log('========================================================\n');

  // Test 1: Reject requests without videoId or playlistId
  console.log('--- Test 1: Rejection without videoId or playlistId ---');
  {
    const { req, res } = createMockHttp({ query: {} });
    const result = applyProtection(req, res);
    assert.strictEqual(result.ok, false, 'applyProtection must return false for missing ID');
    assert.strictEqual(res.statusCode, 400, 'Status code must be 400 for missing ID');
    const json = res.json();
    assert.strictEqual(json.error, 'Validation Error');
    console.log('✓ Correctly rejected with HTTP 400 and message: ' + json.message);
  }

  // Test 2: Reject malformed videoId (not 11 chars or invalid characters)
  console.log('\n--- Test 2: Rejection of malformed videoId ---');
  {
    const { req, res } = createMockHttp({ query: { videoId: 'invalid<script>' } });
    const result = applyProtection(req, res);
    assert.strictEqual(result.ok, false, 'applyProtection must return false for malformed ID');
    assert.strictEqual(res.statusCode, 400, 'Status code must be 400 for malformed ID');
    console.log('✓ Malformed videoId rejected with HTTP 400: ' + res.json().message);
  }

  // Test 3: Request size capping (> 32KB)
  console.log('\n--- Test 3: Request payload size capping (> 32KB) ---');
  {
    const hugePayload = 'A'.repeat(MAX_PAYLOAD_BYTES + 500);
    const { req, res } = createMockHttp({
      method: 'POST',
      headers: { 'content-length': (MAX_PAYLOAD_BYTES + 500).toString() },
      body: hugePayload,
      query: { videoId: 'J7DzL2_Na80' }
    });

    const result = applyProtection(req, res);
    assert.strictEqual(result.ok, false, 'applyProtection must reject payload > 32KB');
    assert.strictEqual(res.statusCode, 413, 'Status code must be 413 Payload Too Large');
    console.log('✓ Oversized payload rejected with HTTP 413: ' + res.json().message);
  }

  // Test 4: Per-IP rate limiting (rejects > 30 requests per minute)
  console.log('\n--- Test 4: Per-IP sliding-window rate limiting ---');
  {
    const testIp = '10.0.0.99';
    let rateLimited = false;

    for (let i = 1; i <= 35; i++) {
      const { req, res } = createMockHttp({
        ip: testIp,
        query: { videoId: 'J7DzL2_Na80' }
      });
      const result = applyProtection(req, res);
      if (!result.ok && res.statusCode === 429) {
        rateLimited = true;
        assert.strictEqual(res.statusCode, 429, 'Status code must be 429 Too Many Requests');
        assert.ok(res.getHeader('retry-after'), 'Must include Retry-After header');
        assert.ok(res.getHeader('x-ratelimit-limit'), 'Must include X-RateLimit-Limit header');
        console.log(`✓ Rate limit triggered on request #${i} with HTTP 429 (Retry-After: ${res.getHeader('retry-after')}s)`);
        break;
      }
    }
    assert.strictEqual(rateLimited, true, 'Rate limiter must trigger after limit threshold');
  }

  // Test 5: /api/youtube Handler Functionality
  console.log('\n--- Test 5: /api/youtube endpoint handling ---');
  {
    const { req, res } = createMockHttp({
      ip: '192.168.2.1',
      query: { videoId: 'J7DzL2_Na80' }
    });

    await youtubeHandler(req, res);
    assert.strictEqual(res.statusCode, 200, '/api/youtube should return 200 OK');
    const json = res.json();
    assert.strictEqual(json.videoId, 'J7DzL2_Na80');
    assert.ok(json.title, 'Response must have video title');
    assert.ok(json.thumbnails, 'Response must have thumbnails');
    console.log(`✓ /api/youtube returned 200 OK: "${json.title}" (${json.source})`);
  }

  // Test 6: /api/quiz Handler Functionality
  console.log('\n--- Test 6: /api/quiz endpoint handling ---');
  {
    const { req, res } = createMockHttp({
      ip: '192.168.2.2',
      method: 'POST',
      body: { videoId: 'mit-1806-l01', timestamp: 252 }
    });

    await quizHandler(req, res);
    assert.strictEqual(res.statusCode, 200, '/api/quiz should return 200 OK');
    const json = res.json();
    assert.strictEqual(json.videoId, 'mit-1806-l01');
    assert.ok(Array.isArray(json.questions), 'Response must have questions array');
    assert.strictEqual(json.questions.length, 8, 'Response must have 8 questions');
    console.log(`✓ /api/quiz returned 200 OK with ${json.questions.length} questions (${json.source})`);
  }

  // Test 7: Secret Safety (Never leak API keys)
  console.log('\n--- Test 7: Secret protection check ---');
  {
    process.env.YOUTUBE_API_KEY = 'TEST_SECRET_YOUTUBE_KEY_12345';
    process.env.GEMINI_API_KEY = 'TEST_SECRET_GEMINI_KEY_67890';

    const { req: req1, res: res1 } = createMockHttp({ ip: '192.168.2.3', query: { videoId: 'J7DzL2_Na80' } });
    await youtubeHandler(req1, res1);
    assert.strictEqual(res1.bodyData.includes('TEST_SECRET_YOUTUBE_KEY_12345'), false, 'YOUTUBE_API_KEY must never leak');

    const { req: req2, res: res2 } = createMockHttp({ ip: '192.168.2.4', query: { videoId: 'mit-1806-l01' } });
    await quizHandler(req2, res2);
    assert.strictEqual(res2.bodyData.includes('TEST_SECRET_GEMINI_KEY_67890'), false, 'GEMINI_API_KEY must never leak');

    console.log('✓ Secrets are strictly isolated server-side and never exposed in client responses.');
  }

  console.log('\n========================================================');
  console.log('All FocusTube Serverless API Tests PASSED! 🎉');
  console.log('========================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
