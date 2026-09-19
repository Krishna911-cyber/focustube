/**
 * Test Suite: FocusTube Study Room - Controls, Camera & Scrolling Fixes
 */

// Mock browser environment
global.window = {
  location: { search: '?demo=1', origin: 'http://localhost:8000' },
  addEventListener: () => {},
  removeEventListener: () => {}
};

const elements = {};
function createMockElement(id, tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    textContent: '',
    innerHTML: '',
    checked: false,
    listeners: {},
    addEventListener(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(fn);
    },
    dispatchEvent(evt) {
      if (this.listeners[evt]) {
        this.listeners[evt].forEach(fn => fn({ preventDefault: () => {}, target: this }));
      }
    },
    click() { this.dispatchEvent('click'); },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 16 }; },
    play() { return Promise.resolve(); },
    pause() {},
    srcObject: null
  };
  elements[id] = el;
  return el;
}

global.document = {
  activeElement: null,
  fullscreenElement: null,
  body: { style: { overflow: '' }, appendChild: () => {} },
  getElementById: (id) => elements[id] || createMockElement(id),
  querySelector: (sel) => {
    if (sel === '.session-title-group h1') return createMockElement('session-h1');
    if (sel === '.player-frame') return createMockElement('player-frame');
    return null;
  },
  getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
  createElement: (tag) => createMockElement('created-' + tag, tag),
  addEventListener: () => {}
};

global.window.navigator = {
  mediaDevices: {
    getUserMedia: () => Promise.resolve({
      getTracks: () => [{ stop: () => {} }]
    })
  }
};
global.navigator = global.window.navigator;

const FocusTubePlayer = require('../js/player.js').FocusTubePlayer;
const FocusTubeCamera = require('../js/camera.js');

// Mock YT Player
FocusTubePlayer.ytPlayer = {
  currentTime: 42,
  duration: 2895,
  state: 2, // paused
  playbackRate: 1.0,
  playVideo() { this.state = 1; },
  pauseVideo() { this.state = 2; },
  seekTo(sec) { this.currentTime = sec; },
  getCurrentTime() { return this.currentTime; },
  getDuration() { return this.duration; },
  getPlayerState() { return this.state; },
  getPlaybackRate() { return this.playbackRate; },
  setPlaybackRate(r) { this.playbackRate = r; }
};

// 1. Test Scrolling / Modal Overflow
console.log('--- TEST 1: Camera Privacy Modal & Body Scroll State ---');
FocusTubeCamera.init();

console.assert(document.body.style.overflow === '', 'Initial body overflow must not be hidden');

// User triggers toggle ON
FocusTubeCamera.elements.toggle.checked = true;
FocusTubeCamera.elements.toggle.dispatchEvent('change');

console.assert(FocusTubeCamera.elements.privacyModal.style.display === 'flex', 'Modal must be display: flex');
console.assert(FocusTubeCamera.elements.privacyModal.classList.contains('open'), 'Modal must have class "open"');
console.assert(document.body.style.overflow === 'hidden', 'Body overflow hidden while modal is visibly open');

// User clicks Cancel
FocusTubeCamera.elements.cancelPrivacyBtn.click();
console.assert(FocusTubeCamera.elements.privacyModal.style.display === 'none', 'Modal must be display: none');
console.assert(!FocusTubeCamera.elements.privacyModal.classList.contains('open'), 'Modal must not have "open" class');
console.assert(document.body.style.overflow === '', 'Body overflow must be restored after Cancel');
console.assert(FocusTubeCamera.elements.toggle.checked === false, 'Toggle switch must reset to unchecked on Cancel');

console.log('Test 1 Passed: Modal properly opens with .open, cancels cleanly, and resets body scroll.');

// 2. Test Camera Enable and Live Preview
console.log('--- TEST 2: Camera Enable & Standby Transition ---');
FocusTubeCamera.elements.toggle.checked = true;
FocusTubeCamera.promptPrivacyConsent();
console.assert(document.body.style.overflow === 'hidden', 'Body overflow hidden when modal prompts');

// User clicks "Enable Camera"
FocusTubeCamera.elements.confirmPrivacyBtn.click();
console.assert(document.body.style.overflow === '', 'Body overflow restored upon enabling camera');
console.assert(FocusTubeCamera.elements.toggle.checked === true, 'Toggle remains checked');

// Disable camera
FocusTubeCamera.disableCamera();
console.assert(document.body.style.overflow === '', 'Body overflow restored upon disabling camera');
console.log('Test 2 Passed: Camera enable/disable properly maintains scrolling and UI states.');

// 3. Test Video Controls Dock
console.log('--- TEST 3: Video Controls (Play/Pause, Rewind, Forward, Scrubber, Speed) ---');
FocusTubePlayer.init();

// Toggle Play/Pause
FocusTubePlayer.togglePlayPause();
console.assert(FocusTubePlayer.ytPlayer.state === 1, 'Video should be playing');
console.assert(FocusTubePlayer.isPlaying() === true, 'isPlaying() must be true');

FocusTubePlayer.togglePlayPause();
console.assert(FocusTubePlayer.ytPlayer.state === 2, 'Video should be paused');
console.assert(FocusTubePlayer.isPlaying() === false, 'isPlaying() must be false');

// Rewind 10s
FocusTubePlayer.ytPlayer.currentTime = 50;
FocusTubePlayer.rewind(10);
console.assert(FocusTubePlayer.ytPlayer.currentTime === 40, `Rewind 10s from 50 should be 40, got ${FocusTubePlayer.ytPlayer.currentTime}`);

// Forward 10s
FocusTubePlayer.forward(10);
console.assert(FocusTubePlayer.ytPlayer.currentTime === 50, `Forward 10s from 40 should be 50, got ${FocusTubePlayer.ytPlayer.currentTime}`);

// Timeline Scrubber Seek
FocusTubePlayer.seekTo(120);
console.assert(FocusTubePlayer.ytPlayer.currentTime === 120, 'Scrubber seekTo(120) should update currentTime');

// Cycle speed
FocusTubePlayer.cyclePlaybackSpeed();
console.assert(FocusTubePlayer.ytPlayer.playbackRate === 1.25, `Next speed should be 1.25x, got ${FocusTubePlayer.ytPlayer.playbackRate}`);
FocusTubePlayer.cyclePlaybackSpeed();
console.assert(FocusTubePlayer.ytPlayer.playbackRate === 1.5, `Next speed should be 1.5x, got ${FocusTubePlayer.ytPlayer.playbackRate}`);

// Time Formatter
console.assert(FocusTubePlayer.formatTime(125) === '02:05', 'formatTime(125) should be 02:05');
console.assert(FocusTubePlayer.formatTime(3600 + 125) === '1:02:05', 'formatTime(3725) should be 1:02:05');

// Update Progress UI
FocusTubePlayer.updateProgressUI(125, 250);
console.assert(elements['player-current-time-display'].textContent === '02:05', 'Current time display should update');
console.assert(elements['player-duration-display'].textContent === '/ 04:10', 'Duration display should update');
console.assert(elements['player-timeline-progress'].style.width === '50%', 'Progress bar width should be 50%');

console.log('Test 3 Passed: Video controls, time sync, scrubber, and speed cycling all function correctly.');
console.log('=== ALL TESTS COMPLETED SUCCESSFULLY ===');
