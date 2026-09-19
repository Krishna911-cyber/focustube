const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log('FocusTube - Live Demo & Edge Case Verification');
console.log('========================================================\n');

// 1. Verify ?demo=1 URL Flag
console.log('--- Testing ?demo=1 flag on Pomodoro Timer ---');
const { FocusTubeTimer } = require('../js/timer.js');

// Mock window.location with ?demo=1
global.window = {
  location: { search: '?demo=1' }
};
global.document = {
  getElementById: (id) => ({
    textContent: '',
    style: {},
    addEventListener: () => {}
  }),
  querySelector: () => ({ textContent: '', appendChild: () => {} }),
  querySelectorAll: () => [],
  createElement: (tag) => {
    const el = {
      id: '',
      className: '',
      style: {},
      set innerHTML(html) {
        this._html = html;
        if (html.includes('Choose another video')) {
          errorOverlayMessage = html;
        }
      },
      get innerHTML() { return this._html || ''; }
    };
    return el;
  },
  addEventListener: () => {}
};

FocusTubeTimer.init();
if (!FocusTubeTimer.isDemoMode) {
  throw new Error('isDemoMode should be true with ?demo=1');
}
if (FocusTubeTimer.FOCUS_DURATION_MS !== 60000) {
  throw new Error('FOCUS_DURATION_MS should be 60000ms (1 minute), got: ' + FocusTubeTimer.FOCUS_DURATION_MS);
}
if (FocusTubeTimer.BREAK_DURATION_MS !== 15000) {
  throw new Error('BREAK_DURATION_MS should be 15000ms (15 seconds), got: ' + FocusTubeTimer.BREAK_DURATION_MS);
}
console.log('✓ ?demo=1 properly unlocks 1-minute Pomodoro block (60,000ms)');

// 2. Test Shift+D Stage Distraction Simulation
console.log('\n--- Testing Shift+D Stage Distraction Simulation ---');
const { FocusTubeFocus } = require('../js/focus.js');

let lossRecorded = null;
FocusTubeFocus.session = {
  videoId: 'mit-1806-l01',
  distractions: []
};
FocusTubeFocus.handleFocusLoss = (type) => {
  lossRecorded = type;
};

// Simulate Shift+D keydown trigger
FocusTubeFocus.simulateDemoDistraction();
if (lossRecorded !== 'tab_hidden') {
  throw new Error('simulateDemoDistraction failed to trigger focus loss, got: ' + lossRecorded);
}
console.log('✓ Shift+D shortcut correctly triggers distraction handling at current video time');

// 3. Test hasSavedVideo() & Empty Storage Redirect
console.log('\n--- Testing hasSavedVideo() & Empty Storage Redirect ---');
const { FocusTubeStorage } = require('../js/storage.js');

// Mock empty localStorage
let mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = val; },
  removeItem: (key) => { delete mockStorage[key]; }
};

if (FocusTubeStorage.hasSavedVideo() !== false) {
  throw new Error('hasSavedVideo() should be false on empty localStorage');
}
console.log('✓ Empty storage correctly reports hasSavedVideo() === false');

// Set video
FocusTubeStorage.setSelectedVideoId('mit-1806-l01');
if (FocusTubeStorage.hasSavedVideo() !== true) {
  throw new Error('hasSavedVideo() should be true when selected video exists');
}
console.log('✓ Saved video correctly reports hasSavedVideo() === true');

// 4. Test Video Loading Error Watchdog & Friendly Error Overlay
console.log('\n--- Testing Video Error Watchdog & Friendly Overlay ---');
const { FocusTubePlayer } = require('../js/player.js');

let errorOverlayMessage = null;
let errorOverlayDisplayed = false;

// Mock DOM container for player
global.document.querySelector = (sel) => {
  if (sel === '.player-frame') {
    return {
      appendChild: (el) => {
        if (el.id === 'player-error-overlay') {
          errorOverlayDisplayed = true;
        }
      }
    };
  }
  return { textContent: '' };
};

global.document.getElementById = (id) => {
  if (id === 'player-error-overlay') {
    return errorOverlayDisplayed ? {
      style: {},
      set innerHTML(html) {
        if (html.includes('Choose another video')) {
          errorOverlayMessage = html;
        }
      }
    } : null;
  }
  return { textContent: '', style: {}, addEventListener: () => {} };
};

// Fire onError with code 150 (embed disabled)
FocusTubePlayer.onError({ data: 150 });
if (!errorOverlayMessage || !errorOverlayMessage.includes('does not allow it to be played in embedded players')) {
  throw new Error('onError(150) failed to render friendly message');
}
if (!errorOverlayMessage.includes('index.html#video-picker')) {
  throw new Error('onError overlay missing link back to video picker');
}
console.log('✓ Video error 150 renders friendly message with link back to index.html#video-picker');

// 5. Test Mid-Session Page Refresh Recovery
console.log('\n--- Testing Mid-Session Page Refresh Recovery ---');
mockStorage['focustube_current_session'] = JSON.stringify({
  videoId: 'mit-1806-l01',
  startedAt: new Date(Date.now() - 30000).toISOString(),
  endedAt: null,
  elapsedBeforePauseMs: 25000,
  totalFocusElapsedMs: 25000,
  currentBlock: 1,
  totalStudyTimeSec: 25,
  distractions: [
    { type: 'tab_hidden', videoTime: 12, durationSec: 5 }
  ]
});

// Re-init timer as if refreshed
FocusTubeTimer.elapsedBeforePauseMs = 0;
FocusTubeTimer.restoreSessionState();
if (FocusTubeTimer.elapsedBeforePauseMs !== 25000) {
  throw new Error('Timer failed to restore elapsedBeforePauseMs (expected 25000, got ' + FocusTubeTimer.elapsedBeforePauseMs + ')');
}
console.log('✓ Page refresh mid-session successfully restores timer elapsed time (' + FocusTubeTimer.elapsedBeforePauseMs + 'ms)');

// Re-init focus telemetry as if refreshed
FocusTubeFocus.elements = {};
FocusTubeFocus.loadSession();
if (FocusTubeFocus.session.distractions.length !== 1) {
  throw new Error('Focus telemetry failed to restore distractions array');
}
console.log('✓ Page refresh mid-session successfully restores distraction history (' + FocusTubeFocus.session.distractions.length + ' distractions)');

console.log('\nAll Live Demo & Edge Case Verification tests passed! 🎉');
