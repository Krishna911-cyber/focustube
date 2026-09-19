/**
 * FocusTube - AI Recall Quiz End-to-End Test Suite
 * Tests Gemini YouTube video quiz generation, JSON repair, distraction-targeted selection,
 * capping at 5 questions, and non-blocking retry states.
 * 
 * Run with: node scripts/test-quiz-flow.js
 */

const assert = require('assert');
const quizHandler = require('../api/quiz.js');
const { extractAndRepairJSON, validateAndNormalizeQuiz, resolveYouTubeId } = quizHandler;
const { FocusTubeSummary } = require('../js/summary.js');
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
  console.log('🧪 Starting FocusTube AI Recall Quiz Test Suite...\n');
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

  // --- Suite 1: YouTube ID Resolution ---
  console.log('🔗 1. YouTube Video ID Resolution');
  test('resolveYouTubeId maps demo slugs to YouTube 11-char IDs', () => {
    assert.strictEqual(resolveYouTubeId('mit-1806-l01'), 'J7DzL2_Na80');
    assert.strictEqual(resolveYouTubeId('3b1b-vectors'), 'fNk_zzaMoSs');
    assert.strictEqual(resolveYouTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  });

  // --- Suite 2: JSON Extraction & Repair Parser ---
  console.log('\n🛠️ 2. JSON Extraction & Repair Parser');
  test('extractAndRepairJSON strips markdown code fences', () => {
    const raw = '```json\n[{"startSec": 100, "question": "Q1", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "E1"}]\n```';
    const parsed = extractAndRepairJSON(raw);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].startSec, 100);
  });

  test('extractAndRepairJSON repairs trailing commas', () => {
    const raw = '[{"startSec": 150, "question": "Q2", "options": ["A","B","C","D",], "correctIndex": 1, "explanation": "E2",},]';
    const parsed = extractAndRepairJSON(raw);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].correctIndex, 1);
  });

  test('extractAndRepairJSON extracts objects from noisy conversational outputs', () => {
    const raw = `Here is the quiz you requested:
    [
      {
        "startSec": 220,
        "question": "What is the column picture?",
        "options": ["Row", "Col", "Diag", "None"],
        "correctIndex": 1,
        "explanation": "Because columns"
      }
    ]
    Hope this helps!`;
    const parsed = extractAndRepairJSON(raw);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].question, "What is the column picture?");
  });

  // --- Suite 3: Schema Validation & Normalization ---
  console.log('\n📋 3. Schema Validation & Chronological Sorting');
  test('validateAndNormalizeQuiz ensures 4 options, valid correctIndex, and sorts by startSec', () => {
    const dirty = [
      {
        startSec: 900,
        question: "Late concept",
        options: ["A", "B", "C", "D"],
        correctIndex: 3,
        explanation: "Late"
      },
      {
        startSec: 120,
        question: "Early concept",
        options: ["1", "2", "3", "4"],
        correctIndex: 99, // invalid index -> clamped to 0
        explanation: "Early"
      },
      {
        // Malformed item with only 2 options -> should be discarded
        startSec: 50,
        question: "Bad item",
        options: ["1", "2"]
      }
    ];

    const clean = validateAndNormalizeQuiz(dirty);
    assert.strictEqual(clean.length, 2);
    // Verified sorted chronologically
    assert.strictEqual(clean[0].startSec, 120);
    assert.strictEqual(clean[0].correctIndex, 0); // clamped
    assert.strictEqual(clean[1].startSec, 900);
  });

  // --- Suite 4: Serverless /api/quiz Endpoint ---
  console.log('\n⚡ 4. /api/quiz Endpoint Execution');
  await testAsync('Handler requires videoId and returns 8 questions in development/fallback mode', async () => {
    const { req, res } = mockReqRes({ query: { videoId: 'mit-1806-l01' } });
    await quizHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.videoId, 'mit-1806-l01');
    assert.strictEqual(res.body.questions.length, 8);

    // Verify question schema on every item
    res.body.questions.forEach((q, idx) => {
      assert.ok(typeof q.startSec === 'number', `q[${idx}].startSec must be number`);
      assert.ok(typeof q.question === 'string' && q.question.length > 0, `q[${idx}].question must be string`);
      assert.strictEqual(q.options.length, 4, `q[${idx}].options must have 4 items`);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3, `q[${idx}].correctIndex must be 0-3`);
      assert.ok(typeof q.explanation === 'string' && q.explanation.length > 0, `q[${idx}].explanation must be string`);
    });
  });

  // --- Suite 5: Distraction-Targeted Selection Algorithm (90s window + nearest fallback + 5 cap) ---
  console.log('\n🎯 5. Distraction-Targeted Question Selection');
  test('selectQuestionsForDistractions selects within 90s before timestamp, nearest fallback, capped at 5', () => {
    const questionBank = [
      { startSec: 100, question: "Concept at 100s", options: ["A","B","C","D"], correctIndex: 0, explanation: "" },
      { startSec: 200, question: "Concept at 200s", options: ["A","B","C","D"], correctIndex: 1, explanation: "" },
      { startSec: 350, question: "Concept at 350s", options: ["A","B","C","D"], correctIndex: 2, explanation: "" },
      { startSec: 500, question: "Concept at 500s", options: ["A","B","C","D"], correctIndex: 0, explanation: "" },
      { startSec: 700, question: "Concept at 700s", options: ["A","B","C","D"], correctIndex: 1, explanation: "" },
      { startSec: 900, question: "Concept at 900s", options: ["A","B","C","D"], correctIndex: 2, explanation: "" },
      { startSec: 1200, question: "Concept at 1200s", options: ["A","B","C","D"], correctIndex: 3, explanation: "" },
      { startSec: 1500, question: "Concept at 1500s", options: ["A","B","C","D"], correctIndex: 0, explanation: "" }
    ];

    // Distraction 1: at 250s (90s window before is 160s - 250s). Concept at 200s is inside!
    // Distraction 2: at 600s (no question in 510s - 600s window). Nearest overall is 500s!
    const distractions = [
      { videoTime: 250, type: 'tab_hidden', durationSec: 12 },
      { videoTime: 600, type: 'face_away', durationSec: 20 }
    ];

    const selected = FocusTubeSummary.selectQuestionsForDistractions(questionBank, distractions);

    // Selected must contain concept at 200s and concept at 500s
    assert.ok(selected.some(q => q.startSec === 200), 'Must pick concept at 200s (within 90s before 250s)');
    assert.ok(selected.some(q => q.startSec === 500), 'Must pick concept at 500s (nearest to 600s)');
    assert.ok(selected.length <= 5, 'Must be capped at 5 questions maximum');
    assert.ok(selected.length >= 3, 'Must pad to at least 3 questions if available');
  });

  test('selectQuestionsForDistractions caps strictly at 5 questions even with 10 distractions', () => {
    const questionBank = Array.from({ length: 8 }, (_, i) => ({
      startSec: (i + 1) * 100,
      question: `Question ${i + 1}`,
      options: ["A","B","C","D"],
      correctIndex: 0,
      explanation: ""
    }));

    const manyDistractions = Array.from({ length: 10 }, (_, i) => ({
      videoTime: (i + 1) * 90,
      type: 'tab_hidden',
      durationSec: 10
    }));

    const selected = FocusTubeSummary.selectQuestionsForDistractions(questionBank, manyDistractions);
    assert.strictEqual(selected.length, 5, 'Must cap at exactly 5 questions maximum');
  });

  // --- Suite 6: Storage Quiz Cache & Prefetch ---
  console.log('\n💾 6. FocusTubeStorage Quiz Cache Operations');
  test('saveQuiz and getQuiz cache under quiz:<videoId>', () => {
    global.localStorage.clear();
    const testQuestions = [
      { startSec: 100, question: "Test Q", options: ["A","B","C","D"], correctIndex: 0, explanation: "" }
    ];

    FocusTubeStorage.saveQuiz('custom-vid-1', testQuestions);

    const cachedRaw = global.localStorage.getItem('quiz:custom-vid-1');
    assert.ok(cachedRaw, 'Must store in localStorage with quiz:custom-vid-1 key');

    const retrieved = FocusTubeStorage.getQuiz('custom-vid-1');
    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].question, 'Test Q');

    assert.strictEqual(FocusTubeStorage.getQuizStatus('custom-vid-1'), 'ready');
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
