const fs = require('fs');
const path = require('path');

console.log('--- Checking all required files ---');
const files = [
  'data/transcripts/mit-1806-l01.json',
  'data/transcripts/3b1b-vectors.json',
  'scripts/generate-quiz.js',
  'data/quizzes/mit-1806-l01.json',
  'data/quizzes/3b1b-vectors.json',
  'quiz.html',
  'js/quiz.js',
  'summary.html',
  'js/summary.js'
];

files.forEach(f => {
  const fullPath = path.join(__dirname, '..', f);
  if (!fs.existsSync(fullPath)) throw new Error('Missing file: ' + f);
  const content = fs.readFileSync(fullPath, 'utf8');
  console.log('✓ ' + f + ' (' + content.length + ' bytes)');
});

console.log('\n--- Checking quiz.html required elements ---');
const quizHtml = fs.readFileSync(path.join(__dirname, '..', 'quiz.html'), 'utf8');
const requiredIds = [
  'quiz-progress-track',
  'quiz-progress-text',
  'quiz-current-num',
  'quiz-total-num',
  'quiz-question-card',
  'quiz-time-pill',
  'quiz-origin-time-text',
  'quiz-concept-pill',
  'quiz-concept-text',
  'quiz-question-stem',
  'quiz-options-group',
  'quiz-feedback-box',
  'quiz-feedback-icon',
  'quiz-feedback-title',
  'quiz-explanation-text',
  'quiz-rewatch-btn',
  'quiz-completion-card',
  'quiz-completion-score',
  'quiz-prev-btn',
  'quiz-next-btn',
  'quiz-lecture-strip',
  'quiz-replay-modal',
  'quiz-replay-player',
  'quiz-replay-modal-close'
];

requiredIds.forEach(id => {
  if (!quizHtml.includes(`id="${id}"`)) {
    throw new Error('Missing ID in quiz.html: ' + id);
  }
});
console.log('✓ All ' + requiredIds.length + ' required IDs found in quiz.html');

console.log('\n--- Checking summary.html required elements ---');
const summaryHtml = fs.readFileSync(path.join(__dirname, '..', 'summary.html'), 'utf8');
['take-quiz-action-btn', 'active-recall-quiz-card', 'card-take-quiz-btn'].forEach(id => {
  if (!summaryHtml.includes(`id="${id}"`)) {
    throw new Error('Missing ID in summary.html: ' + id);
  }
});
console.log('✓ All required IDs found in summary.html');

console.log('\n--- Checking quiz JSON question structures ---');
['mit-1806-l01', '3b1b-vectors'].forEach(id => {
  const quiz = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'quizzes', `${id}.json`), 'utf8'));
  quiz.forEach((q, idx) => {
    if (typeof q.segmentStart !== 'number') throw new Error(id + ' q' + idx + ' invalid segmentStart');
    if (!q.question) throw new Error(id + ' q' + idx + ' missing question');
    if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(id + ' q' + idx + ' invalid options');
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) throw new Error(id + ' q' + idx + ' invalid correctIndex');
    if (!q.explanation) throw new Error(id + ' q' + idx + ' missing explanation');
  });
  console.log('✓ ' + id + ' has ' + quiz.length + ' validated questions');
});

console.log('\n--- Checking matching algorithm & fallback logic ---');
const quizController = require('../js/quiz.js');
const mitQuiz = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'quizzes', 'mit-1806-l01.json'), 'utf8'));

// Test case 1: Distraction at 250s (near 252s) and 1120s (near 1100s)
quizController.quizData = mitQuiz;
quizController.currentSession = {
  distractions: [{ videoTime: 250 }, { videoTime: 1120 }]
};
quizController.matchQuestionsToDistractions();
if (quizController.selectedQuestions[0].segmentStart !== 252) throw new Error('Nearest match failed for 250s');
if (quizController.selectedQuestions[1].segmentStart !== 1100) throw new Error('Nearest match failed for 1120s');
console.log('✓ Nearest segment matching verified for 250s -> 252s and 1120s -> 1100s');

// Test case 2: Perfect focus session (empty distractions)
quizController.currentSession = { distractions: [] };
quizController.matchQuestionsToDistractions();
if (quizController.selectedQuestions.length !== 3) throw new Error('Fallback foundational count mismatch');
console.log('✓ Perfect focus fallback verified (' + quizController.selectedQuestions.length + ' foundational questions)');

console.log('\nAll automated verification tests passed! 🎉');
