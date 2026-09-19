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

if (typeof FocusTubeCamera.YAW_THRESHOLD_DEG !== 'number') {
  throw new Error('YAW_THRESHOLD_DEG constant missing');
}
if (FocusTubeCamera.YAW_THRESHOLD_DEG !== 25) {
  throw new Error('YAW_THRESHOLD_DEG expected 25, got ' + FocusTubeCamera.YAW_THRESHOLD_DEG);
}
console.log('✓ YAW_THRESHOLD_DEG constant is defined:', FocusTubeCamera.YAW_THRESHOLD_DEG, 'degrees');

if (typeof FocusTubeCamera.LOOK_AWAY_DURATION_MS !== 'number') {
  throw new Error('LOOK_AWAY_DURATION_MS constant missing');
}
if (FocusTubeCamera.LOOK_AWAY_DURATION_MS !== 1500) {
  throw new Error('LOOK_AWAY_DURATION_MS expected 1500, got ' + FocusTubeCamera.LOOK_AWAY_DURATION_MS);
}
console.log('✓ LOOK_AWAY_DURATION_MS constant is defined:', FocusTubeCamera.LOOK_AWAY_DURATION_MS, 'ms (1.5 seconds)');

if (typeof FocusTubeCamera.TARGET_FPS !== 'number' || FocusTubeCamera.TARGET_FPS < 5 || FocusTubeCamera.TARGET_FPS > 8) {
  throw new Error('TARGET_FPS expected 5-8 FPS, got ' + FocusTubeCamera.TARGET_FPS);
}
console.log('✓ TARGET_FPS constant is defined:', FocusTubeCamera.TARGET_FPS, 'FPS');

// 3. Test Head Yaw Matrix Calculation
console.log('\n--- Testing 4x4 matrix decomposition for Head Yaw ---');
// Identity matrix (0 degrees yaw)
const identityMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
];
const yawIdentity = FocusTubeCamera.calculateYawFromMatrix(identityMatrix);
console.log('  Identity matrix yaw:', yawIdentity.toFixed(2), 'deg');
if (Math.abs(yawIdentity) > 0.001) throw new Error('Identity matrix yaw should be 0');

// 30 degree Y-rotation matrix (column-major)
// [ cos30,  0, sin30, 0,
//       0,  1,     0, 0,
//  -sin30,  0, cos30, 0,
//       0,  0,     0, 1 ]
const rad30 = 30 * (Math.PI / 180);
const cos30 = Math.cos(rad30);
const sin30 = Math.sin(rad30);
const rot30Matrix = [
  cos30, 0, -sin30, 0,  // col 0
  0,     1,      0, 0,  // col 1
  sin30, 0,  cos30, 0,  // col 2 (col 2 row 0 is index 8 = sin30, col 2 row 2 is index 10 = cos30)
  0,     0,      0, 1   // col 3
];
const yaw30 = FocusTubeCamera.calculateYawFromMatrix(rot30Matrix);
console.log('  30° rotated matrix yaw:', yaw30.toFixed(2), 'deg');
if (Math.abs(yaw30 - 30) > 0.5) throw new Error('Rotated matrix yaw should be ~30 degrees');
console.log('✓ Matrix yaw calculation validated');

// 4. Test Landmark Geometric Ratio Yaw Calculation
console.log('\n--- Testing landmark geometric ratio estimation ---');
// Frontal facing mock: nose centered between cheeks (ratio = 0.5)
const mockFrontalLandmarks = new Array(460).fill({ x: 0, y: 0, z: 0 });
mockFrontalLandmarks[1] = { x: 0.50, y: 0.5, z: 0 };   // Nose tip
mockFrontalLandmarks[234] = { x: 0.30, y: 0.5, z: 0 }; // Left cheek
mockFrontalLandmarks[454] = { x: 0.70, y: 0.5, z: 0 }; // Right cheek
const geomYawFrontal = FocusTubeCamera.calculateYawFromLandmarks(mockFrontalLandmarks);
console.log('  Frontal landmarks yaw:', geomYawFrontal, 'deg');
if (geomYawFrontal > 5) throw new Error('Frontal landmarks should yield ~0 degrees yaw');

// Turned head mock: nose shifted toward left cheek (ratio = 0.8)
const mockTurnedLandmarks = new Array(460).fill({ x: 0, y: 0, z: 0 });
mockTurnedLandmarks[1] = { x: 0.62, y: 0.5, z: 0 };   // Nose turned
mockTurnedLandmarks[234] = { x: 0.30, y: 0.5, z: 0 };
mockTurnedLandmarks[454] = { x: 0.70, y: 0.5, z: 0 };
const geomYawTurned = FocusTubeCamera.calculateYawFromLandmarks(mockTurnedLandmarks);
console.log('  Turned landmarks yaw:', geomYawTurned, 'deg');
if (geomYawTurned <= FocusTubeCamera.YAW_THRESHOLD_DEG) {
  throw new Error('Turned landmarks should exceed threshold (25 deg)');
}
console.log('✓ Landmark geometry yaw calculation validated');

// 5. Test Attention Classification & 1.5s Timing
console.log('\n--- Testing 1.5s look-away threshold timing ---');
let triggeredCount = 0;
FocusTubeCamera.triggerFaceAwayDistraction = () => {
  triggeredCount++;
};

// Simulate momentary flicker away (e.g. 500ms)
FocusTubeCamera.awayStartTime = Date.now() - 500;
FocusTubeCamera.isCurrentlyLookingAway = false;
FocusTubeCamera.handleAttentionClassification(true, true, 35);
if (triggeredCount !== 0) throw new Error('Should not trigger distraction at 500ms away');
console.log('✓ 500ms look-away safely ignored by 1.5s timer');

// Simulate sustained look-away (>1500ms)
FocusTubeCamera.awayStartTime = Date.now() - 1600;
FocusTubeCamera.handleAttentionClassification(true, true, 35);
if (triggeredCount !== 1) throw new Error('Should trigger distraction after 1.5s away');
console.log('✓ Sustained look-away (>1500ms) correctly triggered distraction');

// Simulate user looking back: candidate timer cleared
FocusTubeCamera.handleAttentionClassification(false, true, 10);
if (FocusTubeCamera.awayStartTime !== null) throw new Error('Looking forward should reset awayStartTime');
console.log('✓ Looking forward correctly resets away timer');

// 6. Test study.html markup
console.log('\n--- Checking study.html required camera elements ---');
const studyHtml = fs.readFileSync(studyHtmlPath, 'utf8');

const requiredCameraIds = [
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
  'camera-cancel-privacy-btn'
];

requiredCameraIds.forEach(id => {
  if (!studyHtml.includes(`id="${id}"`)) {
    throw new Error('Missing ID in study.html: ' + id);
  }
});
console.log('✓ All ' + requiredCameraIds.length + ' required camera DOM element IDs present in study.html');

if (!studyHtml.includes('<script src="js/camera.js"></script>')) {
  throw new Error('Missing camera.js script tag in study.html');
}
console.log('✓ <script src="js/camera.js"></script> linked in study.html');

// 7. Test css/styles.css toggle & preview classes
console.log('\n--- Checking css/styles.css camera classes ---');
const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
const requiredClasses = [
  '.switch-container',
  '.switch-input',
  '.switch-slider',
  '.camera-preview-container',
  '.camera-preview-video',
  '.camera-hud-overlay',
  '.camera-status-pill',
  '.camera-status-pill.focused',
  '.camera-status-pill.away'
];
requiredClasses.forEach(cls => {
  if (!stylesCss.includes(cls)) {
    throw new Error('Missing class in css/styles.css: ' + cls);
  }
});
console.log('✓ All required Camera CSS styles validated in css/styles.css');

console.log('\nAll Camera Attention Detection tests passed successfully! 🎉');
