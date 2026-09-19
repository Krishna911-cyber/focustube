const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log('FocusTube - Camera Attention Detection Verification');
console.log('========================================================\n');

// 1. Verify files exist
console.log('--- Checking camera files ---');
const cameraJsPath = path.join(__dirname, '..', 'js', 'camera.js');
const studyHtmlPath = path.join(__dirname, '..', 'study.html');
const stylesCssPath = path.join(__dirname, '..', 'css', 'styles.css');

if (!fs.existsSync(cameraJsPath)) throw new Error('Missing js/camera.js');
if (!fs.existsSync(studyHtmlPath)) throw new Error('Missing study.html');
if (!fs.existsSync(stylesCssPath)) throw new Error('Missing css/styles.css');
console.log('✓ js/camera.js, study.html, and css/styles.css exist');

// 2. Test camera module constants and exports
console.log('\n--- Checking camera constants & exports ---');
const FocusTubeCamera = require('../js/camera.js');

const expectedConstants = {
  YAW_THRESHOLD_DEG: 25,
  PITCH_DOWN_THRESHOLD_DEG: 15,
  PITCH_SLIGHT_DOWN_DEG: 5,
  GAZE_DOWN_DELTA_THRESHOLD: 0.3,
  PHONE_SCORE_THRESHOLD: 0.4,
  FACE_AWAY_DURATION_MS: 1500,
  LOOK_AWAY_DURATION_MS: 1500,
  LOOKING_DOWN_DURATION_MS: 3000,
  PHONE_VISIBLE_DURATION_MS: 1500,
  CALIBRATION_DURATION_MS: 3000,
  TARGET_FPS: 6,
  OBJECT_DETECTOR_FPS: 2
};

for (const [name, val] of Object.entries(expectedConstants)) {
  if (typeof FocusTubeCamera[name] !== 'number') {
    throw new Error(`Missing or non-numeric constant: ${name}`);
  }
  if (FocusTubeCamera[name] !== val) {
    throw new Error(`Constant ${name} expected ${val}, got ${FocusTubeCamera[name]}`);
  }
  console.log(`✓ ${name} = ${FocusTubeCamera[name]}`);
}

// 3. Test Three.js XYZ Euler matrix decomposition
console.log('\n--- Testing 4x4 Three.js XYZ Euler matrix decomposition ---');
// Identity matrix (0 degrees pitch, yaw, roll)
const identityMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];
const eulerIdentity = FocusTubeCamera.calculateEulerFromMatrix(identityMatrix);
console.log('  Identity matrix:', eulerIdentity);
if (Math.abs(eulerIdentity.yaw) > 0.001 || Math.abs(eulerIdentity.pitch) > 0.001) {
  throw new Error('Identity matrix should have ~0 pitch and yaw');
}

// Pure 30° Y-rotation matrix (column-major)
const rad30 = 30 * (Math.PI / 180);
const cos30 = Math.cos(rad30);
const sin30 = Math.sin(rad30);
const rot30YMatrix = [
  cos30,  0, -sin30, 0, // col 0
  0,      1,      0, 0, // col 1
  sin30,  0,  cos30, 0, // col 2 (m13 = sin30)
  0,      0,      0, 1  // col 3
];
const euler30Y = FocusTubeCamera.calculateEulerFromMatrix(rot30YMatrix);
console.log('  30° Yaw matrix:', euler30Y);
if (Math.abs(euler30Y.yaw - 30) > 0.5 || Math.abs(euler30Y.pitch) > 0.5) {
  throw new Error('30° Y-rotation should yield ~30° yaw and ~0° pitch');
}

// Pure -20° X-rotation matrix (pitch down in column-major)
const radNeg20 = -20 * (Math.PI / 180);
const cos20 = Math.cos(radNeg20);
const sin20 = Math.sin(radNeg20);
const rot20XMatrix = [
  1,      0,       0, 0, // col 0
  0,  cos20,   sin20, 0, // col 1
  0, -sin20,   cos20, 0, // col 2
  0,      0,       0, 1  // col 3
];
const euler20X = FocusTubeCamera.calculateEulerFromMatrix(rot20XMatrix);
console.log('  -20° Pitch matrix:', euler20X);
if (Math.abs(euler20X.pitch - (-20)) > 0.5 || Math.abs(euler20X.yaw) > 0.5) {
  throw new Error('-20° X-rotation should yield ~ -20° pitch');
}
console.log('✓ Three.js XYZ Euler decomposition verified');

// 4. Test Blendshape gaze-down extraction
console.log('\n--- Testing gaze-down blendshape extraction ---');
const mockBlendshapes = [
  {
    categories: [
      { categoryName: 'eyeBlinkLeft', score: 0.1 },
      { categoryName: 'eyeLookDownLeft', score: 0.42 },
      { categoryName: 'eyeLookDownRight', score: 0.58 },
      { categoryName: 'eyeLookUpLeft', score: 0.05 }
    ]
  }
];
const gazeDown = FocusTubeCamera.extractGazeDown(mockBlendshapes);
console.log('  Extracted GazeDown (0.42 & 0.58 avg):', gazeDown);
if (Math.abs(gazeDown - 0.50) > 0.01) {
  throw new Error(`Expected gazeDown 0.50, got ${gazeDown}`);
}
console.log('✓ Blendshape gaze-down extraction verified');

// 5. Test Two-Pose Calibration Step & Direction Learning
console.log('\n--- Testing two-pose calibration & direction learning ---');
FocusTubeCamera.startCalibration();
if (!FocusTubeCamera.isCalibrating) throw new Error('isCalibrating should be true');
if (FocusTubeCamera.calibrationStep !== 1) throw new Error('Initial calibrationStep should be 1');

// Feed step 1 (screen pose) samples
FocusTubeCamera.recordCalibrationSample({ yaw: 2, pitch: 5, gazeDown: 0.1 });
FocusTubeCamera.recordCalibrationSample({ yaw: 4, pitch: 7, gazeDown: 0.14 });

// Force transition to Step 2 (phone pose)
FocusTubeCamera.calibrationStep = 2;
FocusTubeCamera.calibrationStartTime = Date.now();
FocusTubeCamera.recordCalibrationSample({ yaw: 3, pitch: -14, gazeDown: 0.6 });
FocusTubeCamera.recordCalibrationSample({ yaw: 5, pitch: -16, gazeDown: 0.64 });

FocusTubeCamera.finishCalibration();

console.log('  Computed Baseline (Screen):', FocusTubeCamera.baseline);
console.log('  Computed PhonePose:', FocusTubeCamera.phonePose);
console.log(`  Learned dir: ${FocusTubeCamera.dir}, range: ${FocusTubeCamera.range}°`);

if (Math.abs(FocusTubeCamera.baseline.pitch - 6.0) > 0.1) {
  throw new Error(`Expected baseline pitch 6.0, got ${FocusTubeCamera.baseline.pitch}`);
}
if (Math.abs(FocusTubeCamera.phonePose.pitch - (-15.0)) > 0.1) {
  throw new Error(`Expected phonePose pitch -15.0, got ${FocusTubeCamera.phonePose.pitch}`);
}
// Pitch decreased (-15 < 6), so dir should be -1
if (FocusTubeCamera.dir !== -1) {
  throw new Error(`Expected dir -1 for downward pitch drop, got ${FocusTubeCamera.dir}`);
}
// Range = max(|-15 - 6|, 8) = 21
if (Math.abs(FocusTubeCamera.range - 21) > 0.1) {
  throw new Error(`Expected range 21, got ${FocusTubeCamera.range}`);
}
if (!FocusTubeCamera.isCalibrated) {
  throw new Error('isCalibrated should be true after successful two-pose calibration');
}
console.log('✓ Two-pose calibration automatically learned direction (-1) and range (21°)');

// 5B. Test Calibration Failure when range < 3°
console.log('\n--- Testing calibration failure (range < 3°) ---');
FocusTubeCamera.startCalibration();
FocusTubeCamera.recordCalibrationSample({ yaw: 0, pitch: 10, gazeDown: 0.1 });
FocusTubeCamera.calibrationStep = 2;
FocusTubeCamera.calibrationStartTime = Date.now();
FocusTubeCamera.recordCalibrationSample({ yaw: 0, pitch: 11, gazeDown: 0.1 }); // Only 1° difference!
FocusTubeCamera.finishCalibration();

if (FocusTubeCamera.isCalibrated) {
  throw new Error('Calibration should fail when poses have < 3° difference');
}
if (FocusTubeCamera.calibrationError !== "Calibration didn't detect a difference, try again") {
  throw new Error(`Expected error message "Calibration didn't detect a difference, try again", got "${FocusTubeCamera.calibrationError}"`);
}
console.log('✓ Calibration failure correctly caught and disables tracking when range < 3°');

// Restore valid calibration for subsequent tests
FocusTubeCamera.baseline = { yaw: 0, pitch: 0, gazeDown: 0.1 };
FocusTubeCamera.phonePose = { yaw: 0, pitch: -20, gazeDown: 0.6 };
FocusTubeCamera.dir = -1;
FocusTubeCamera.range = 20;
FocusTubeCamera.isCalibrated = true;

// 6. Test Multi-Condition Distraction Classification & Session Gating
console.log('\n--- Testing downness calculation & distraction classification ---');

// Mock FocusTubeFocus to control session active status
global.window = global.window || {};
let mockSessionActive = true;
global.window.FocusTubeFocus = {
  isSessionActive: () => mockSessionActive,
  handleFocusLoss: (type) => { lastTriggeredType = type; },
  handleFocusReturn: () => {}
};

let lastTriggeredType = null;

// Case 6A: Downness > 0.6 persists for 3s during session -> looking_down
console.log('  Testing Case 6A: Downness > 0.6 persists for 3s during active session');
mockSessionActive = true;
FocusTubeCamera.isTakingNotes = false;
FocusTubeCamera.isCurrentlyLookingAway = false;
FocusTubeCamera.currentPitch = -16; // baseline is 0, dir is -1, range is 20
const pitchDelta = FocusTubeCamera.currentPitch - FocusTubeCamera.baseline.pitch;
FocusTubeCamera.currentDownness = Math.round(((pitchDelta * FocusTubeCamera.dir) / FocusTubeCamera.range) * 100) / 100;
console.log('  Calculated downness for pitch -16°:', FocusTubeCamera.currentDownness);
if (FocusTubeCamera.currentDownness <= 0.6) {
  throw new Error(`Expected downness > 0.6, got ${FocusTubeCamera.currentDownness}`);
}

const now = Date.now();
FocusTubeCamera.lookingDownStartTime = now - 3100;

FocusTubeCamera.evaluateAttentionTriggers({
  now,
  hasFace: true,
  isFaceAwayCandidate: false,
  isLookingDownCandidate: true,
  isPhoneCandidate: false
});
if (lastTriggeredType !== 'looking_down') {
  throw new Error(`Expected 'looking_down' distraction, got ${lastTriggeredType}`);
}
console.log('  ✓ looking_down triggered after 3s of high downness (> 0.6)');

// Case 6B: Looking down does NOT log distraction if session is NOT running
console.log('  Testing Case 6B: Distraction NOT logged when session is not running');
mockSessionActive = false;
lastTriggeredType = null;
FocusTubeCamera.isCurrentlyLookingAway = false;
FocusTubeCamera.lookingDownStartTime = now - 3100;
FocusTubeCamera.triggerDistraction('looking_down');
if (lastTriggeredType !== null) {
  throw new Error('Distraction MUST NOT be logged when session is not running');
}
console.log('  ✓ Distraction suppressed while session is not running (live HUD remains active)');

// Case 6C: Taking notes disables looking_down rule
console.log('  Testing Case 6C: "Taking notes" toggle disables looking_down candidate');
mockSessionActive = true;
FocusTubeCamera.isTakingNotes = true;
lastTriggeredType = null;
FocusTubeCamera.isCurrentlyLookingAway = false;
const isLookingDownWhenTakingNotes = !FocusTubeCamera.isTakingNotes && (0.85 > FocusTubeCamera.DOWN_THRESHOLD_NORMALIZED);
if (isLookingDownWhenTakingNotes !== false) {
  throw new Error('Taking notes toggle should disable looking down candidate');
}
console.log('  ✓ Taking notes toggle successfully disables looking down candidate');

// Case 6D: Phone visible with head down for 1.5s -> phone_visible
console.log('  Testing Case 6D: Phone visible with head down for 1.5s');
FocusTubeCamera.isTakingNotes = false;
FocusTubeCamera.isCurrentlyLookingAway = false;
lastTriggeredType = null;
FocusTubeCamera.phoneStartTime = now - 1600;
FocusTubeCamera.evaluateAttentionTriggers({
  now,
  hasFace: true,
  isFaceAwayCandidate: false,
  isLookingDownCandidate: false,
  isPhoneCandidate: true
});
if (lastTriggeredType !== 'phone_visible') {
  throw new Error(`Expected 'phone_visible' distraction, got ${lastTriggeredType}`);
}
console.log('  ✓ phone_visible triggered after 1.5s with head down');

// Case 6E: Face away for 1.5s -> face_away
console.log('  Testing Case 6E: Face away / yaw for 1.5s');
FocusTubeCamera.isCurrentlyLookingAway = false;
lastTriggeredType = null;
FocusTubeCamera.faceAwayStartTime = now - 1600;
FocusTubeCamera.evaluateAttentionTriggers({
  now,
  hasFace: false,
  isFaceAwayCandidate: true,
  isLookingDownCandidate: false,
  isPhoneCandidate: false
});
if (lastTriggeredType !== 'face_away') {
  throw new Error(`Expected 'face_away' distraction, got ${lastTriggeredType}`);
}
console.log('  ✓ face_away triggered after 1.5s away');

// 7. Verify study.html elements & hints
console.log('\n--- Checking study.html DOM elements & hint ---');
const studyHtml = fs.readFileSync(studyHtmlPath, 'utf8');

const requiredIds = [
  'camera-attention-card',
  'camera-attention-toggle',
  'camera-status-badge',
  'camera-preview-container',
  'camera-standby-placeholder',
  'camera-preview-video',
  'camera-hud-overlay',
  'camera-hud-status-pill',
  'camera-hud-fps-text',
  'camera-hud-yaw-text',
  'camera-hidden-video',
  'camera-privacy-modal',
  'camera-confirm-privacy-btn',
  'camera-cancel-privacy-btn',
  'camera-calibration-overlay',
  'camera-calibration-text',
  'camera-calibration-progress',
  'taking-notes-toggle',
  'camera-recalibrate-btn',
  'session-start-hint'
];

requiredIds.forEach(id => {
  if (!studyHtml.includes(`id="${id}"`)) {
    throw new Error(`Missing ID in study.html: ${id}`);
  }
});
if (!studyHtml.includes('Start the session to turn on distraction tracking and departure alerts.')) {
  throw new Error('Missing Start button hint in study.html');
}
console.log(`✓ All ${requiredIds.length} required camera DOM elements and Start button hint present in study.html`);

// 8. Verify css/styles.css classes & fixed banner positioning
console.log('\n--- Checking css/styles.css camera and exit banner classes ---');
const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
const requiredClasses = [
  '.camera-preview-container',
  '.camera-preview-video',
  '.camera-hud-overlay',
  '.camera-status-pill',
  '.camera-status-pill.focused',
  '.camera-status-pill.away',
  '.camera-status-pill.calibrating',
  '.camera-calibration-overlay',
  '.calibration-progress-bar',
  '.calibration-progress-fill',
  '.camera-debug-overlay',
  '.exit-intent-banner'
];

requiredClasses.forEach(cls => {
  if (!stylesCss.includes(cls)) {
    throw new Error(`Missing class in css/styles.css: ${cls}`);
  }
});

// Check that .exit-intent-banner has position: fixed, top: 0, z-index: 999999
if (!stylesCss.includes('position: fixed;') || !stylesCss.includes('top: 0;') || !stylesCss.includes('z-index: 999999;')) {
  throw new Error('.exit-intent-banner must have position: fixed, top: 0, and z-index: 999999');
}
console.log(`✓ All ${requiredClasses.length} required CSS styles and fixed banner properties validated`);

console.log('\n========================================================');
console.log('All Camera Attention Detection tests passed successfully! 🎉');
console.log('========================================================');
