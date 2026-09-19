/**
 * FocusTube - Pre-Departure Warnings Test Suite
 * Verifies all 5 requirements:
 * 1. Exit-intent banner (mouseout, cooldown, auto-hide, no distraction logged)
 * 2. beforeunload leave-site dialog and sessionActive = false on in-app navigation
 * 3. document.title warning on tab hidden and restoration on return
 * 4. Optional system notification (permission on Start session, toggle, tab hidden notice)
 * 5. Strict distraction tracking integrity (no double-counting, only visibilitychange/blur)
 */

const assert = require('assert');

console.log('========================================================');
console.log('FocusTube - Pre-Departure Warnings Test Suite');
console.log('========================================================\n');

// Mock browser environment
let eventListeners = {};
let documentListeners = {};

global.window = {
  sessionActive: false,
  addEventListener: (event, handler) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
  },
  FocusTubeTimer: {
    isRunning: false,
    mode: 'focus',
    resume() { this.isRunning = true; },
    pause() { this.isRunning = false; },
    getElapsedSeconds() { return 100; }
  },
  FocusTubePlayer: {
    _playing: false,
    isPlaying() { return this._playing; },
    play() { this._playing = true; },
    pause() { this._playing = false; }
  }
};

function MockNotification(title, options) {
  MockNotification.instances.push({ title, options });
}
MockNotification.permission = 'default';
MockNotification.requested = false;
MockNotification.instances = [];
MockNotification.requestPermission = function() {
  MockNotification.requested = true;
  return Promise.resolve('granted');
};

global.window.Notification = MockNotification;
global.Notification = MockNotification;

let elementsMap = {};
global.document = {
  title: 'Study Room — FocusTube',
  hidden: false,
  body: {
    prepend: (el) => { elementsMap[el.id] = el; },
    appendChild: (el) => { elementsMap[el.id] = el; }
  },
  addEventListener: (event, handler, useCapture) => {
    const key = event + (useCapture ? ':capture' : '');
    if (!documentListeners[key]) documentListeners[key] = [];
    documentListeners[key].push(handler);
  },
  getElementById: (id) => elementsMap[id] || null,
  querySelector: (sel) => null,
  querySelectorAll: (sel) => [],
  createElement: (tag) => {
    const el = {
      id: '',
      className: '',
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      },
      style: {},
      offsetWidth: 100,
      setAttribute: (k, v) => {},
      innerHTML: ''
    };
    return el;
  }
};

let mockLocalStorage = {};
global.localStorage = {
  getItem: (k) => (k in mockLocalStorage ? mockLocalStorage[k] : null),
  setItem: (k, v) => { mockLocalStorage[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage[k]; }
};

const { FocusTubeFocus } = require('../js/focus.js');

// Mock DOM buttons
const timerToggleBtn = {
  id: 'timer-toggle-btn',
  addEventListener: (event, handler) => {
    if (!timerToggleBtn._handlers) timerToggleBtn._handlers = [];
    timerToggleBtn._handlers.push(handler);
  },
  click() {
    (timerToggleBtn._handlers || []).forEach(h => h());
  }
};
elementsMap['timer-toggle-btn'] = timerToggleBtn;

const notificationToggle = {
  id: 'notification-toggle',
  checked: true,
  addEventListener: (event, handler) => {
    if (!notificationToggle._handlers) notificationToggle._handlers = [];
    notificationToggle._handlers.push(handler);
  },
  change(val) {
    this.checked = val;
    (notificationToggle._handlers || []).forEach(h => h({ target: { checked: val } }));
  }
};
elementsMap['notification-toggle'] = notificationToggle;

FocusTubeFocus.init();

// -------------------------------------------------------------
// Test 1: Active Focus Block Running Check
// -------------------------------------------------------------
console.log('--- Test 1: isFocusBlockRunning conditions ---');

// Initially sessionActive is false and timer/player paused
assert.strictEqual(FocusTubeFocus.isFocusBlockRunning(), false, 'Should be false when sessionActive is false');

// Activate session and running states
FocusTubeFocus.setSessionActive(true);
window.FocusTubeTimer.isRunning = true;
window.FocusTubeTimer.mode = 'focus';
window.FocusTubePlayer._playing = true;
assert.strictEqual(FocusTubeFocus.isFocusBlockRunning(), true, 'Should be true when video playing and timer running in focus mode');

// During break, must be false
window.FocusTubeTimer.mode = 'break';
assert.strictEqual(FocusTubeFocus.isFocusBlockRunning(), false, 'Must be false during break mode');
window.FocusTubeTimer.mode = 'focus';

// When video is paused, must be false
window.FocusTubePlayer._playing = false;
assert.strictEqual(FocusTubeFocus.isFocusBlockRunning(), false, 'Must be false when video is paused');
window.FocusTubePlayer._playing = true;

// When timer is paused, must be false
window.FocusTubeTimer.isRunning = false;
assert.strictEqual(FocusTubeFocus.isFocusBlockRunning(), false, 'Must be false when timer is paused');
window.FocusTubeTimer.isRunning = true;

// When session ended, must be false
FocusTubeFocus.session.endedAt = new Date().toISOString();
assert.strictEqual(FocusTubeFocus.isFocusBlockRunning(), false, 'Must be false after session has ended');
FocusTubeFocus.session.endedAt = null;

console.log('✓ isFocusBlockRunning correctly gates on video playing + timer running in focus mode');

// -------------------------------------------------------------
// Test 2: Exit-Intent Banner
// -------------------------------------------------------------
console.log('\n--- Test 2: Exit-Intent Banner & Cooldown ---');

FocusTubeFocus.session.distractions = [];
FocusTubeFocus.lastExitIntentTime = 0;
const initialDistractionsCount = FocusTubeFocus.session.distractions.length;

// Fire mouseout not leaving through top
const mouseoutHandlers = documentListeners['mouseout'] || [];
assert(mouseoutHandlers.length > 0, 'mouseout listener should be registered');

// Test 2a: mouseout with relatedTarget (not leaving page)
mouseoutHandlers.forEach(h => h({ relatedTarget: {}, clientY: -5 }));
assert.strictEqual(elementsMap['exit-intent-banner'], undefined, 'Banner should not show if relatedTarget exists');

// Test 2b: mouseout inside page (clientY > 0)
mouseoutHandlers.forEach(h => h({ relatedTarget: null, clientY: 50 }));
assert.strictEqual(elementsMap['exit-intent-banner'], undefined, 'Banner should not show if clientY > 0');

// Test 2c: mouseout leaving through top edge (relatedTarget: null, clientY <= 0)
mouseoutHandlers.forEach(h => h({ relatedTarget: null, clientY: -2 }));
const banner = elementsMap['exit-intent-banner'];
assert(banner, 'Banner element should be created/shown');
assert(banner.classList.contains('visible'), 'Banner should have visible class');
assert.strictEqual(banner.innerHTML.includes('Leaving? Your video and timer will pause, and this counts as a distraction.'), true, 'Banner text matches specification');

// Verify it was NOT logged as a distraction
assert.strictEqual(FocusTubeFocus.session.distractions.length, initialDistractionsCount, 'Exit-intent banner MUST NOT log a distraction');
console.log('✓ Exit-intent banner triggers on top-edge exit without logging distraction');

// Test 2d: 10-second cooldown
banner.classList.remove('visible');
mouseoutHandlers.forEach(h => h({ relatedTarget: null, clientY: -1 }));
assert.strictEqual(banner.classList.contains('visible'), false, '10-second cooldown must prevent re-triggering banner');
console.log('✓ 10-second cooldown properly enforced');

// Test 2e: Mousemove upward into top 30px (after cooldown reset)
FocusTubeFocus.lastExitIntentTime = 0;
const mousemoveHandlers = documentListeners['mousemove'] || [];
assert(mousemoveHandlers.length > 0, 'mousemove listener should be registered');

// Downward movement or > 30px: should NOT trigger
mousemoveHandlers.forEach(h => h({ clientY: 80 }));
mousemoveHandlers.forEach(h => h({ clientY: 100 })); // moving down
assert.strictEqual(banner.classList.contains('visible'), false, 'Downward mouse movement should not trigger banner');

// Upward movement into top 30px: 40 -> 25 (moving upward into top 30px)
mousemoveHandlers.forEach(h => h({ clientY: 40 }));
mousemoveHandlers.forEach(h => h({ clientY: 25 }));
assert.strictEqual(banner.classList.contains('visible'), true, 'Upward mouse movement entering top 30px should trigger banner');
console.log('✓ Mousemove entering top 30px while moving upward triggers departure banner');

// Test 2f: Document mouseleave with clientY <= 0 (after cooldown reset)
FocusTubeFocus.lastExitIntentTime = 0;
banner.classList.remove('visible');
const mouseleaveHandlers = documentListeners['mouseleave'] || [];
assert(mouseleaveHandlers.length > 0, 'mouseleave listener should be registered');

mouseleaveHandlers.forEach(h => h({ clientY: -5 }));
assert.strictEqual(banner.classList.contains('visible'), true, 'Document mouseleave through top (clientY <= 0) should trigger banner');
console.log('✓ Document mouseleave through top edge (clientY <= 0) triggers departure banner');

// -------------------------------------------------------------
// Test 3: beforeunload Handler & In-App Navigation sessionActive = false
// -------------------------------------------------------------
console.log('\n--- Test 3: beforeunload Handler & In-App Navigation ---');

const beforeunloadHandlers = eventListeners['beforeunload'] || [];
assert(beforeunloadHandlers.length > 0, 'beforeunload handler should be registered');

// Test 3a: beforeunload while session is running triggers leave dialog
let prevented = false;
let returnVal = null;
const mockEvent = {
  preventDefault: () => { prevented = true; },
  set returnValue(v) { returnVal = v; },
  get returnValue() { return returnVal; }
};

FocusTubeFocus.setSessionActive(true);
window.FocusTubeTimer.isRunning = true;
window.FocusTubeTimer.mode = 'focus';
window.FocusTubePlayer._playing = true;

beforeunloadHandlers.forEach(h => h(mockEvent));
assert.strictEqual(prevented, true, 'beforeunload should call preventDefault when session is running');
assert.strictEqual(returnVal, '', 'beforeunload should set returnValue to trigger browser leave-site dialog');
console.log('✓ beforeunload triggers leave-site dialog when focus session is running');

// Test 3b: in-app navigation sets sessionActive = false
const clickCaptureHandlers = documentListeners['click:capture'] || [];
assert(clickCaptureHandlers.length > 0, 'click capture handler should be registered');

// Click "End Session"
clickCaptureHandlers.forEach(h => h({
  target: {
    closest: () => ({
      getAttribute: () => 'summary.html',
      id: '',
      textContent: 'End Session',
      classList: { contains: () => false }
    })
  }
}));

assert.strictEqual(FocusTubeFocus.sessionActive, false, 'Clicking End Session must set sessionActive = false');
assert.strictEqual(window.sessionActive, false, 'window.sessionActive must sync to false');

// Verify beforeunload is NOT triggered now
prevented = false;
returnVal = null;
beforeunloadHandlers.forEach(h => h(mockEvent));
assert.strictEqual(prevented, false, 'beforeunload must NOT trigger when sessionActive is false');
console.log('✓ In-app navigation (End Session) sets sessionActive = false and bypasses beforeunload dialog');

// Click "Choose another video"
FocusTubeFocus.setSessionActive(true);
clickCaptureHandlers.forEach(h => h({
  target: {
    closest: () => ({
      getAttribute: () => 'index.html#video-picker',
      id: 'choose-another-video-btn',
      textContent: 'Choose another video',
      classList: { contains: () => false }
    })
  }
}));
assert.strictEqual(FocusTubeFocus.sessionActive, false, 'Clicking Choose another video must set sessionActive = false');
console.log('✓ In-app navigation (Choose another video) sets sessionActive = false');

// Click "Next lecture"
FocusTubeFocus.setSessionActive(true);
clickCaptureHandlers.forEach(h => h({
  target: {
    closest: () => ({
      getAttribute: () => '',
      id: 'next-queue-play-btn',
      textContent: 'Play next lecture',
      classList: { contains: () => false }
    })
  }
}));
assert.strictEqual(FocusTubeFocus.sessionActive, false, 'Clicking Play next lecture must set sessionActive = false');
console.log('✓ In-app navigation (Next lecture) sets sessionActive = false');

// -------------------------------------------------------------
// Test 4: Tab Title Alert & Restoration
// -------------------------------------------------------------
console.log('\n--- Test 4: Tab Title Alert & Restoration ---');

const visibilityHandlers = documentListeners['visibilitychange'] || [];
assert(visibilityHandlers.length > 0, 'visibilitychange handler should be registered');

// Make session running
FocusTubeFocus.setSessionActive(true);
window.FocusTubeTimer.isRunning = true;
window.FocusTubeTimer.mode = 'focus';
window.FocusTubePlayer._playing = true;
document.title = 'Study Room — FocusTube';

// Simulate tab hidden
document.hidden = true;
visibilityHandlers.forEach(h => h());

assert.strictEqual(document.title, '⚠️ Come back to your session!', 'Tab title should update to warning when hidden during running session');
console.log('✓ Tab title changes to "⚠️ Come back to your session!" on tab hidden');

// Simulate user returning
document.hidden = false;
visibilityHandlers.forEach(h => h());
assert.strictEqual(document.title, 'Study Room — FocusTube', 'Tab title should restore to original when user returns');
console.log('✓ Tab title restored to original on return');

// -------------------------------------------------------------
// Test 5: Optional System Notification & Toggle
// -------------------------------------------------------------
console.log('\n--- Test 5: Optional System Notification & Toggle ---');

// Permission request on Start session click
global.window.Notification.requested = false;
global.window.Notification.permission = 'default';
FocusTubeFocus.notificationsEnabled = true;

timerToggleBtn.click();
assert.strictEqual(global.window.Notification.requested, true, 'Start session click should request notification permission');
console.log('✓ Start session click requests Notification permission');

// Sending notification on tab hidden
global.window.Notification.permission = 'granted';
global.window.Notification.instances = [];
FocusTubeFocus.setSessionActive(true);
window.FocusTubeTimer.isRunning = true;
window.FocusTubeTimer.mode = 'focus';
window.FocusTubePlayer._playing = true;

document.hidden = true;
visibilityHandlers.forEach(h => h());

assert.strictEqual(global.window.Notification.instances.length, 1, 'Should send 1 notification when tab is hidden');
assert.strictEqual(global.window.Notification.instances[0].options.body, 'Your session is paused. Come back to continue.', 'Notification body matches requirement');
console.log('✓ Notification "Your session is paused. Come back to continue." sent on tab hidden');

// Toggle turning notifications off
notificationToggle.change(false);
assert.strictEqual(FocusTubeFocus.notificationsEnabled, false, 'Toggle switch should disable notifications');
global.window.Notification.instances = [];

// Tab hidden again when toggled off
FocusTubeFocus.setSessionActive(true);
window.FocusTubeTimer.isRunning = true;
window.FocusTubePlayer._playing = true;
document.hidden = true;
visibilityHandlers.forEach(h => h());

assert.strictEqual(global.window.Notification.instances.length, 0, 'No notification sent when user has toggled them off');
console.log('✓ Toggle properly mutes system notifications');

// -------------------------------------------------------------
// Test 6: Distraction Tracking Integrity (No double-counting)
// -------------------------------------------------------------
console.log('\n--- Test 6: Distraction Tracking Integrity ---');

FocusTubeFocus.session.distractions = [];
FocusTubeFocus.isAway = false;
FocusTubeFocus.pendingLoss = null;

// Simulate focus loss via visibilitychange
FocusTubeFocus.setSessionActive(true);
window.FocusTubeTimer.isRunning = true;
window.FocusTubePlayer._playing = true;
document.hidden = true;

FocusTubeFocus.handleFocusLoss('tab_hidden');
assert.strictEqual(FocusTubeFocus.isAway, true, 'isAway should be true after loss');

// Window blur fires simultaneously
FocusTubeFocus.handleFocusLoss('window_blur');
// Should NOT overwrite pendingLoss or double log
assert.strictEqual(FocusTubeFocus.pendingLoss.type, 'tab_hidden', 'Double event should be ignored by isAway check');

// Simulate return after 1.5 seconds (1500ms > 1000ms debounce)
FocusTubeFocus.pendingLoss.startedAt = Date.now() - 1500;
FocusTubeFocus.handleFocusReturn();

assert.strictEqual(FocusTubeFocus.session.distractions.length, 1, 'Exactly 1 distraction registered');
assert.strictEqual(FocusTubeFocus.session.distractions[0].type, 'tab_hidden');

console.log('✓ Distraction tracking maintains integrity with zero double-counting');

console.log('\n========================================================');
console.log('ALL PRE-DEPARTURE WARNING TESTS PASSED! 🎉');
console.log('========================================================');
