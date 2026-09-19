/**
 * FocusTube - Playlist API & Queue Unit & Integration Tests
 * Run with: node scripts/test-playlist.js
 */

const assert = require('assert');
const playlistHandler = require('../api/playlist.js');
const { extractPlaylistId, isMixPlaylist } = playlistHandler;
const { FocusTubeStorage } = require('../js/storage.js');

// Mock localStorage for Node environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new MockLocalStorage();

function mockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...(options.headers || {})
    },
    query: options.query || {},
    body: options.body || null
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key] = val;
    },
    end(data) {
      this.body = data ? JSON.parse(data) : null;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('🧪 Starting FocusTube Playlist & Study Queue Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(e);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(e);
      failed++;
    }
  }

  // --- Suite 1: Playlist ID Extraction ---
  console.log('📦 1. URL & Playlist ID Parsing Tests');
  test('extractPlaylistId extracts from standard playlist URL', () => {
    const id = extractPlaylistId('https://www.youtube.com/playlist?list=PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k');
    assert.strictEqual(id, 'PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k');
  });

  test('extractPlaylistId extracts from watch URL with list param', () => {
    const id = extractPlaylistId('https://www.youtube.com/watch?v=J7DzL2_Na80&list=PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k&index=1');
    assert.strictEqual(id, 'PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k');
  });

  test('extractPlaylistId handles bare playlist IDs', () => {
    const id = extractPlaylistId('PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k');
    assert.strictEqual(id, 'PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k');
  });

  test('extractPlaylistId rejects invalid or blank inputs', () => {
    assert.strictEqual(extractPlaylistId(''), null);
    assert.strictEqual(extractPlaylistId('   '), null);
    assert.strictEqual(extractPlaylistId('not_a_valid_id!'), null);
  });

  // --- Suite 2: YouTube Mix Detection ---
  console.log('\n🚫 2. YouTube Mix Rejection Tests');
  test('isMixPlaylist identifies RD... mix playlists', () => {
    assert.strictEqual(isMixPlaylist('RDMMJ7DzL2_Na80'), true);
    assert.strictEqual(isMixPlaylist('RDCLAK5uy_k1234'), true);
    assert.strictEqual(isMixPlaylist('UL12345678901'), true);
  });

  test('isMixPlaylist allows standard PL... user playlists', () => {
    assert.strictEqual(isMixPlaylist('PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k'), false);
    assert.strictEqual(isMixPlaylist('UU12345678901234567890'), false);
  });

  // --- Suite 3: Serverless API Handler Tests ---
  console.log('\n⚡ 3. /api/playlist.js Endpoint Tests');
  await testAsync('Handler returns 400 for missing playlistId', async () => {
    const { req, res } = mockReqRes({ query: {} });
    await playlistHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'Validation Error');
  });

  await testAsync('Handler rejects YouTube Mix with friendly 400 error', async () => {
    const { req, res } = mockReqRes({ query: { playlistId: 'RDMMJ7DzL2_Na80' } });
    await playlistHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'Mix Playlist Not Supported');
    assert.ok(res.body.message.includes('auto-generated dynamic radio'));
  });

  await testAsync('Handler returns playlist items in fallback/demo mode when API key absent', async () => {
    const oldKey = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    const { req, res } = mockReqRes({ query: { playlistId: 'PLUl4u3cNGP63oMNUHXqIUcrkS2PivhN3k' } });
    await playlistHandler(req, res);
    if (oldKey) process.env.YOUTUBE_API_KEY = oldKey;

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.strictEqual(res.body.items.length, 4);
    assert.strictEqual(res.body.items[0].videoId, 'J7DzL2_Na80');
    assert.strictEqual(res.body.items[0].position, 1);
    assert.ok(res.body.items[0].title);
    assert.ok(res.body.items[0].thumbnail);
  });

  // --- Suite 4: Storage Queue & Per-Video Distraction Tracking ---
  console.log('\n💾 4. FocusTubeStorage Queue & Per-Video Distractions');
  test('Storage queue operations work correctly', () => {
    global.localStorage.clear();
    assert.strictEqual(FocusTubeStorage.hasQueue(), false);

    const testQueue = [
      { videoId: 'vid1', title: 'Lecture 1', position: 1 },
      { videoId: 'vid2', title: 'Lecture 2', position: 2 },
      { videoId: 'vid3', title: 'Lecture 3', position: 3 }
    ];

    FocusTubeStorage.saveQueue(testQueue);
    assert.strictEqual(FocusTubeStorage.hasQueue(), true);
    assert.strictEqual(FocusTubeStorage.getQueue().length, 3);
    assert.strictEqual(FocusTubeStorage.getCurrentQueueIndex(), 0);

    // Test getNextQueueItem
    const next1 = FocusTubeStorage.getNextQueueItem();
    assert.ok(next1);
    assert.strictEqual(next1.nextIndex, 1);
    assert.strictEqual(next1.item.videoId, 'vid2');

    // Advance queue index
    FocusTubeStorage.setCurrentQueueIndex(1);
    assert.strictEqual(FocusTubeStorage.getCurrentQueueIndex(), 1);

    const next2 = FocusTubeStorage.getNextQueueItem();
    assert.ok(next2);
    assert.strictEqual(next2.nextIndex, 2);
    assert.strictEqual(next2.item.videoId, 'vid3');

    // Advance to end of queue
    FocusTubeStorage.setCurrentQueueIndex(2);
    assert.strictEqual(FocusTubeStorage.getNextQueueItem(), null);

    // Clear queue
    FocusTubeStorage.clearQueue();
    assert.strictEqual(FocusTubeStorage.hasQueue(), false);
  });

  test('Per-video distraction logging isolates events per videoId', () => {
    global.localStorage.clear();

    const d1 = { videoId: 'lecture-A', type: 'tab_hidden', videoTime: 120, durationSec: 15 };
    const d2 = { videoId: 'lecture-A', type: 'face_away', videoTime: 240, durationSec: 30 };
    const d3 = { videoId: 'lecture-B', type: 'window_blur', videoTime: 45, durationSec: 10 };

    FocusTubeStorage.saveVideoDistraction(d1);
    FocusTubeStorage.saveVideoDistraction(d2);
    FocusTubeStorage.saveVideoDistraction(d3);

    const lA = FocusTubeStorage.getDistractionsForVideo('lecture-A');
    const lB = FocusTubeStorage.getDistractionsForVideo('lecture-B');
    const lC = FocusTubeStorage.getDistractionsForVideo('lecture-C');

    assert.strictEqual(lA.length, 2);
    assert.strictEqual(lA[0].videoTime, 120);
    assert.strictEqual(lA[1].videoTime, 240);

    assert.strictEqual(lB.length, 1);
    assert.strictEqual(lB[0].type, 'window_blur');

    assert.strictEqual(lC.length, 0);

    const all = FocusTubeStorage.getAllDistractions();
    assert.strictEqual(Object.keys(all).length, 2);
    assert.strictEqual(all['lecture-A'].length, 2);
    assert.strictEqual(all['lecture-B'].length, 1);
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
