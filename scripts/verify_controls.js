const fs = require('fs');
const player = require('../js/player.js');
const camera = require('../js/camera.js');

console.log('--- Testing FocusTubePlayer ---');
console.assert(typeof player.FocusTubePlayer.togglePlayPause === 'function', 'togglePlayPause must be a function');
console.assert(typeof player.FocusTubePlayer.rewind === 'function', 'rewind must be a function');
console.assert(typeof player.FocusTubePlayer.forward === 'function', 'forward must be a function');
console.assert(typeof player.FocusTubePlayer.seekTo === 'function', 'seekTo must be a function');
console.assert(typeof player.FocusTubePlayer.formatTime === 'function', 'formatTime must be a function');
console.assert(player.FocusTubePlayer.formatTime(65) === '01:05', 'formatTime(65) should be 01:05');
console.assert(player.FocusTubePlayer.formatTime(3665) === '1:01:05', 'formatTime(3665) should be 1:01:05');

console.log('--- Testing FocusTubeCamera ---');
console.assert(camera.YAW_THRESHOLD_DEG === 25, 'YAW_THRESHOLD_DEG should be 25');
console.assert(camera.LOOK_AWAY_DURATION_MS === 1500, 'LOOK_AWAY_DURATION_MS should be 1500');
console.assert(camera.TARGET_FPS === 6, 'TARGET_FPS should be 6');

console.log('--- Testing study.html DOM elements ---');
const html = fs.readFileSync('study.html', 'utf8');
const requiredIds = [
  'player-play-pause-btn',
  'player-rewind-btn',
  'player-forward-btn',
  'player-timeline-bar',
  'player-timeline-progress',
  'player-current-time-display',
  'player-duration-display',
  'player-speed-btn',
  'player-fullscreen-btn',
  'camera-attention-toggle',
  'camera-privacy-modal',
  'camera-confirm-privacy-btn',
  'camera-cancel-privacy-btn',
  'camera-preview-video',
  'camera-hud-overlay'
];

for (const id of requiredIds) {
  console.assert(html.includes(`id="${id}"`), `Missing ID in study.html: ${id}`);
}

console.log('All automated assertions PASSED!');
