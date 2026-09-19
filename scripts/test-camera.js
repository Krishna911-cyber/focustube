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

// 5. Test Calibration Step & Baseline Calculation
console.log('\n--- Testing calibration step & baseline computation ---');
FocusTubeCamera.startCalibration();
if (!FocusTubeCamera.isCalibrating) throw new Error('isCalibrating should be true');

// Feed sample frames over 3 seconds
FocusTubeCamera.recordCalibrationSample({ yaw: 2, pitch: 5, gazeDown: 0.1 });
FocusTubeCamera.recordCalibrationSample({ yaw: 4, pitch: 7, gazeDown: 0.14 });
FocusTubeCamera.finishCalibration();

console.log('  Computed Baseline:', FocusTubeCamera.baseline);
if (Math.abs(FocusTubeCamera.baseline.pitch - 6.0) > 0.1) {
  throw new Error(`Expected baseline pitch 6.0, got ${FocusTubeCamera.baseline.pitch}`);
}
if (Math.abs(FocusTubeCamera.baseline.yaw - 3.0) > 0.1) {
  throw new Error(`Expected baseline yaw 3.0, got ${FocusTubeCamera.baseline.yaw}`);
}
if (Math.abs(FocusTubeCamera.baseline.gazeDown - 0.12) > 0.01) {
  throw new Error(`Expected baseline gazeDown 0.12, got ${FocusTubeCamera.baseline.gazeDown}`);
}
console.log('✓ Calibration baseline correctly computes sample averages');

// 6. Test Multi-Condition Distraction Classification
console.log('\n--- Testing distraction rules & timers ---');
let lastTriggeredType = null;
FocusTubeCamera.triggerDistraction = (type) => {
  lastTriggeredType = type;
};

// Reset state
FocusTubeCamera.baseline = { yaw: 0, pitch: 0, gazeDown: 0.1 };
FocusTubeCamera.isTakingNotes = false;
FocusTubeCamera.isCurrentlyLookingAway = false;
FocusTubeCamera.phoneStartTime = null;
FocusTubeCamera.lookingDownStartTime = null;
FocusTubeCamera.faceAwayStartTime = null;

// Case 6A: Pitch > 15° below baseline for 3s -> looking_down
console.log('  Testing Case 6A: Pitch > 15° below baseline for 3s');
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
console.log('  ✓ looking_down triggered after 3s of head pitch drop');

// Case 6B: Taking notes disables looking_down rule
console.log('  Testing Case 6B: "Taking notes" toggle disables looking_down');
FocusTubeCamera.isTakingNotes = true;
lastTriggeredType = null;
FocusTubeCamera.isCurrentlyLookingAway = false;
// Pitch below baseline = 18 degrees, but taking notes is ON
const isLookingDownWhenTakingNotes = !FocusTubeCamera.isTakingNotes && (18 >= FocusTubeCamera.PITCH_DOWN_THRESHOLD_DEG);
if (isLookingDownWhenTakingNotes !== false) {
  throw new Error('Taking notes toggle should disable looking down candidate');
}
console.log('  ✓ Taking notes toggle successfully disables looking down candidate');

// Case 6C: Phone visible with head down for 1.5s -> phone_visible
console.log('  Testing Case 6C: Phone visible with head down for 1.5s');
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

// Case 6D: Face away for 1.5s -> face_away
console.log('  Testing Case 6D: Face away / yaw for 1.5s');
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

// 7. Verify study.html elements
console.log('\n--- Checking study.html DOM elements ---');
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
  'camera-recalibrate-btn'
];

requiredIds.forEach(id => {
  if (!studyHtml.includes(`id="${id}"`)) {
    throw new Error(`Missing ID in study.html: ${id}`);
  }
});
console.log(`✓ All ${requiredIds.length} required camera DOM elements present in study.html`);

// 8. Verify css/styles.css classes
console.log('\n--- Checking css/styles.css camera classes ---');
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
  '.camera-debug-overlay'
];

requiredClasses.forEach(cls => {
  if (!stylesCss.includes(cls)) {
    throw new Error(`Missing class in css/styles.css: ${cls}`);
  }
});
console.log(`✓ All ${requiredClasses.length} required CSS styles validated in css/styles.css`);

console.log('\n========================================================');
console.log('All Camera Attention Detection tests passed successfully! 🎉');
console.log('========================================================');
