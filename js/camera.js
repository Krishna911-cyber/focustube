/**
 * FocusTube - Optional Camera Attention Detection Module
 * Powered by MediaPipe Face Landmarker & ObjectDetector (tasks-vision) running 100% on-device.
 * 
 * Features:
 * 1. Facial pose decomposition (Three.js XYZ Euler formula on column-major transformation matrix).
 * 2. Gaze-down tracking via eyeLookDownLeft & eyeLookDownRight blendshapes.
 * 3. 3-second baseline calibration step on startup, with on-demand Recalibrate button.
 * 4. Lightweight ObjectDetector (EfficientDet-Lite0) at ~2 FPS detecting cell phones.
 * 5. Multi-condition distraction logging:
 *    - pitch > 15° below baseline for 3.0s -> 'looking_down'
 *    - gazeDown > 0.3 above baseline with head slightly down (>5°) for 3.0s -> 'looking_down'
 *    - cell phone visible with head down (>5°) for 1.5s -> 'phone_visible'
 *    - head yaw > 25° or no face for 1.5s -> 'face_away'
 * 6. "Taking notes" toggle that disables looking-down distraction rules.
 * 7. Live debug telemetry overlay active under `?debug=1`.
 * 8. Zero frames stored, serialized, or transmitted (100% on-device WebAssembly/WebGL).
 */

// ============================================================================
// Core Thresholds & Timing Constants
// ============================================================================
const YAW_THRESHOLD_DEG = 25;               // Degrees off-center for head yaw
const PITCH_DOWN_THRESHOLD_DEG = 15;         // Degrees below baseline pitch for looking down (fallback)
const PITCH_SLIGHT_DOWN_DEG = 5;             // Degrees below baseline pitch for slight head down
const GAZE_DOWN_DELTA_THRESHOLD = 0.3;       // GazeDown delta above baseline (0.0 - 1.0)
const PHONE_SCORE_THRESHOLD = 0.4;           // Minimum confidence score for cell phone detection
const FACE_AWAY_DURATION_MS = 1500;          // 1.5s away before triggering face_away distraction
const LOOKING_DOWN_DURATION_MS = 3000;       // 3.0s looking down before triggering looking_down distraction
const PHONE_VISIBLE_DURATION_MS = 1500;      // 1.5s phone visible with head down before triggering phone_visible distraction
const CALIBRATION_DURATION_MS = 3000;        // 3.0s duration per step
const CALIBRATION_STEP_DURATION_MS = 3000;   // 3.0s per step (Step 1: Screen, Step 2: Phone)
const MIN_CALIBRATION_RANGE_DEG = 3;         // Minimum degrees between poses to succeed
const DOWN_THRESHOLD_NORMALIZED = 0.6;       // Normalized downness threshold for LOOKING DOWN
const TARGET_FPS = 6;                        // FaceLandmarker detection cycle FPS (~166ms)
const OBJECT_DETECTOR_FPS = 2;               // ObjectDetector detection cycle FPS (~500ms)

// Backward compatibility alias for existing test suites
const LOOK_AWAY_DURATION_MS = FACE_AWAY_DURATION_MS;

// MediaPipe CDN URLs
const MEDIAPIPE_VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';
const MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MEDIAPIPE_FACE_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MEDIAPIPE_OBJECT_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

const FocusTubeCamera = {
  // Constant references for testing & inspection
  YAW_THRESHOLD_DEG,
  PITCH_DOWN_THRESHOLD_DEG,
  PITCH_SLIGHT_DOWN_DEG,
  GAZE_DOWN_DELTA_THRESHOLD,
  PHONE_SCORE_THRESHOLD,
  FACE_AWAY_DURATION_MS,
  LOOK_AWAY_DURATION_MS,
  LOOKING_DOWN_DURATION_MS,
  PHONE_VISIBLE_DURATION_MS,
  CALIBRATION_DURATION_MS,
  CALIBRATION_STEP_DURATION_MS,
  MIN_CALIBRATION_RANGE_DEG,
  DOWN_THRESHOLD_NORMALIZED,
  TARGET_FPS,
  OBJECT_DETECTOR_FPS,

  // State
  isEnabled: false,
  isInitializing: false,
  isAvailable: true,
  stream: null,
  faceLandmarker: null,
  objectDetector: null,
  detectionTimer: null,
  lastInferenceTime: 0,
  lastObjectInferenceTime: 0,

  // Two-Pose Calibration state
  isCalibrating: false,
  calibrationStep: 1, // 1 = screen, 2 = phone
  calibrationStartTime: null,
  screenSamples: [],
  phoneSamples: [],
  calibrationSamples: [], // backward compatibility
  baseline: { yaw: 0, pitch: 0, gazeDown: 0, geomRatio: 0.55 },
  phonePose: { yaw: 0, pitch: -20, gazeDown: 0.6, geomRatio: 0.75 },
  dir: -1, // Default -1 for Three.js XYZ Euler where looking down lowers pitch
  range: 15,
  isCalibrated: false,
  calibrationError: null,

  // Candidate timers for distraction classification
  faceAwayStartTime: null,
  lookingDownStartTime: null,
  phoneStartTime: null,
  isCurrentlyLookingAway: false,
  activeDistractionType: null,

  // Live telemetry metrics
  currentYaw: 0,
  currentPitch: 0,
  currentGazeDown: 0,
  currentGazeUp: 0,
  currentGeomPitchRatio: 0.55,
  currentDownness: 0,
  isPhoneDetected: false,
  phoneScore: 0,
  isTakingNotes: false,
  isDebugMode: false,
  measuredFPS: TARGET_FPS,
  fpsCounter: 0,
  lastFpsCheck: 0,

  // DOM Elements cache
  elements: {},

  init() {
    this.checkDebugMode();
    this.loadPersistedSettings();
    this.cacheElements();
    this.bindEvents();
    this.ensureDebugOverlay();
    console.log('[Camera] FocusTube Enhanced Camera Attention Module Initialized (Standby)');
  },

  checkDebugMode() {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      this.isDebugMode = params.get('debug') === '1' || window.location.search.includes('debug=1');
    }
  },

  loadPersistedSettings() {
    try {
      if (typeof localStorage !== 'undefined') {
        this.isTakingNotes = localStorage.getItem('focustube_taking_notes') === 'true';
        const savedBaseline = localStorage.getItem('focustube_camera_baseline');
        if (savedBaseline) {
          const parsed = JSON.parse(savedBaseline);
          // Only accept valid two-pose calibrated settings with dir and range
          if (parsed && parsed.baseline && typeof parsed.baseline.pitch === 'number' && typeof parsed.dir === 'number' && typeof parsed.range === 'number') {
            this.baseline = parsed.baseline;
            this.phonePose = parsed.phonePose || { yaw: 0, pitch: -20, gazeDown: 0.6, geomRatio: 0.75 };
            this.dir = parsed.dir;
            this.range = parsed.range;
            this.isCalibrated = true;
          } else {
            // Purge legacy/uncalibrated data to guarantee fresh two-pose calibration
            localStorage.removeItem('focustube_camera_baseline');
            this.isCalibrated = false;
            this.dir = -1;
            this.range = 15;
          }
        }
      }
    } catch (e) {
      console.warn('[Camera] Failed to read persisted camera settings:', e);
    }
  },

  cacheElements() {
    if (typeof document === 'undefined') return;
    this.elements = {
      toggle: document.getElementById('camera-attention-toggle'),
      statusBadge: document.getElementById('camera-status-badge'),
      previewBox: document.getElementById('camera-preview-container'),
      previewVideo: document.getElementById('camera-preview-video'),
      standbyPlaceholder: document.getElementById('camera-standby-placeholder'),
      hudOverlay: document.getElementById('camera-hud-overlay'),
      hudStatusPill: document.getElementById('camera-hud-status-pill'),
      hudYawText: document.getElementById('camera-hud-yaw-text'),
      hudFpsText: document.getElementById('camera-hud-fps-text'),
      privacyModal: document.getElementById('camera-privacy-modal'),
      confirmPrivacyBtn: document.getElementById('camera-confirm-privacy-btn'),
      cancelPrivacyBtn: document.getElementById('camera-cancel-privacy-btn'),
      hiddenVideo: document.getElementById('camera-hidden-video'),
      calibrationOverlay: document.getElementById('camera-calibration-overlay'),
      calibrationText: document.getElementById('camera-calibration-text'),
      calibrationProgress: document.getElementById('camera-calibration-progress'),
      takingNotesToggle: document.getElementById('taking-notes-toggle'),
      recalibrateBtn: document.getElementById('camera-recalibrate-btn'),
      debugOverlay: document.getElementById('camera-debug-overlay')
    };

    if (this.elements.takingNotesToggle) {
      this.elements.takingNotesToggle.checked = this.isTakingNotes;
    }
  },

  bindEvents() {
    if (typeof document === 'undefined') return;

    // Attention tracking toggle switch
    if (this.elements.toggle) {
      this.elements.toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.promptPrivacyConsent();
        } else {
          this.disableCamera();
        }
      });
    }

    // "Taking notes" toggle switch
    if (this.elements.takingNotesToggle) {
      this.elements.takingNotesToggle.addEventListener('change', (e) => {
        this.isTakingNotes = e.target.checked;
        try {
          localStorage.setItem('focustube_taking_notes', this.isTakingNotes ? 'true' : 'false');
        } catch (err) {}
        console.log(`[Camera] Taking notes mode: ${this.isTakingNotes ? 'ON (looking_down rules disabled)' : 'OFF'}`);
        this.updateDebugOverlay();
      });
    }

    // Recalibrate button
    if (this.elements.recalibrateBtn) {
      this.elements.recalibrateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.isEnabled) {
          this.startCalibration();
        }
      });
    }

    // Privacy Modal Buttons
    if (this.elements.confirmPrivacyBtn) {
      this.elements.confirmPrivacyBtn.addEventListener('click', () => {
        this.hidePrivacyModal();
        this.enableCamera();
      });
    }

    if (this.elements.cancelPrivacyBtn) {
      this.elements.cancelPrivacyBtn.addEventListener('click', () => {
        this.hidePrivacyModal();
        if (this.elements.toggle) this.elements.toggle.checked = false;
      });
    }

    // Modal backdrop click
    if (this.elements.privacyModal) {
      this.elements.privacyModal.addEventListener('click', (e) => {
        if (e.target === this.elements.privacyModal) {
          this.hidePrivacyModal();
          if (this.elements.toggle) this.elements.toggle.checked = false;
        }
      });
    }

    // ESC key closes modal safely
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.privacyModal && (this.elements.privacyModal.classList.contains('open') || this.elements.privacyModal.style.display === 'flex')) {
        this.hidePrivacyModal();
        if (this.elements.toggle) this.elements.toggle.checked = false;
      }
    });
  },

  promptPrivacyConsent() {
    if (this.elements.privacyModal) {
      this.elements.privacyModal.style.display = 'flex';
      this.elements.privacyModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      this.enableCamera();
    }
  },

  hidePrivacyModal() {
    if (this.elements.privacyModal) {
      this.elements.privacyModal.classList.remove('open');
      this.elements.privacyModal.style.display = 'none';
    }
    document.body.style.overflow = '';
  },

  /**
   * Initializes MediaPipe FaceLandmarker and ObjectDetector, requests webcam stream,
   * and starts calibration phase.
   */
  async enableCamera() {
    if (this.isInitializing) return;
    this.isInitializing = true;
    document.body.style.overflow = '';
    if (this.elements.toggle) this.elements.toggle.checked = true;
    this.updateStatusUI('Calibrating...', 'warning');

    try {
      // 1. Request user media (explicit user action)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam mediaDevices API not supported in this browser');
      }

      console.log('[Camera] Requesting camera stream...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        },
        audio: false
      });
      this.stream = stream;

      // 2. Attach stream to preview & hidden video elements immediately
      if (this.elements.previewVideo) {
        this.elements.previewVideo.srcObject = stream;
        this.elements.previewVideo.style.display = 'block';
        this.elements.previewVideo.play().catch(() => {});
      }
      if (this.elements.standbyPlaceholder) {
        this.elements.standbyPlaceholder.style.display = 'none';
      }
      if (this.elements.hudOverlay) {
        this.elements.hudOverlay.style.display = 'flex';
      }
      if (this.elements.hudStatusPill) {
        this.elements.hudStatusPill.className = 'camera-status-pill calibrating';
        this.elements.hudStatusPill.textContent = 'CALIBRATING...';
      }

      let hiddenVid = this.elements.hiddenVideo;
      if (!hiddenVid) {
        hiddenVid = document.createElement('video');
        hiddenVid.id = 'camera-hidden-video';
        hiddenVid.setAttribute('playsinline', '');
        hiddenVid.setAttribute('muted', '');
        hiddenVid.style.display = 'none';
        document.body.appendChild(hiddenVid);
        this.elements.hiddenVideo = hiddenVid;
      }
      hiddenVid.srcObject = stream;
      await hiddenVid.play().catch(() => {});

      // 3. Load MediaPipe Vision tasks via CDN
      console.log('[Camera] Loading MediaPipe Vision Bundle...');
      const { FilesetResolver, FaceLandmarker, ObjectDetector } = await import(MEDIAPIPE_VISION_BUNDLE);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
      
      // 3a. FaceLandmarker with blendshapes and transformation matrixes
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_FACE_MODEL_PATH
        },
        runningMode: 'VIDEO',
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: true,
        numFaces: 1
      });
      console.log('[Camera] MediaPipe Face Landmarker loaded successfully!');

      // 3b. ObjectDetector for cell phone detection at ~2 FPS (graceful fallback)
      try {
        console.log('[Camera] Loading MediaPipe ObjectDetector for cell phone detection...');
        this.objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_OBJECT_MODEL_PATH
          },
          runningMode: 'VIDEO',
          scoreThreshold: PHONE_SCORE_THRESHOLD
        });
        console.log('[Camera] MediaPipe ObjectDetector loaded successfully!');
      } catch (objErr) {
        console.warn('[Camera] ObjectDetector failed to load, falling back to face/gaze only:', objErr.message);
        this.objectDetector = null;
      }

      // 4. Activate detection loop and start initial calibration
      this.isEnabled = true;
      this.isInitializing = false;
      this.isAvailable = true;
      this.showActiveUI();
      this.ensureDebugOverlay();
      this.startCalibration();
      this.startDetectionLoop();

    } catch (err) {
      console.warn('[Camera] Camera initialization failed or permission denied:', err);
      this.handleUnavailable(err.message || 'Camera unavailable');
    }
  },

  /**
   * Gracefully shuts down camera stream and inference loop
   */
  disableCamera() {
    this.isEnabled = false;
    this.isInitializing = false;
    this.isCalibrating = false;
    document.body.style.overflow = '';

    // Stop detection timer
    if (this.detectionTimer) {
      cancelAnimationFrame(this.detectionTimer);
      this.detectionTimer = null;
    }

    // Stop hardware tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      this.stream = null;
    }

    // Reset video elements
    if (this.elements.previewVideo) {
      this.elements.previewVideo.srcObject = null;
    }
    if (this.elements.hiddenVideo) {
      this.elements.hiddenVideo.srcObject = null;
    }

    this.faceAwayStartTime = null;
    this.lookingDownStartTime = null;
    this.phoneStartTime = null;
    this.isCurrentlyLookingAway = false;
    this.activeDistractionType = null;
    this.hideCalibrationUI();

    if (this.elements.recalibrateBtn) {
      this.elements.recalibrateBtn.style.display = 'none';
    }
    if (this.elements.debugOverlay) {
      this.elements.debugOverlay.style.display = 'none';
    }

    this.showStandbyUI();
    console.log('[Camera] Attention tracking disabled (Hardware stream released)');
  },

  /**
   * Silently falls back to tab detection if camera is denied or model fails
   */
  handleUnavailable(reason) {
    this.disableCamera();
    this.isAvailable = false;

    if (this.elements.toggle) {
      this.elements.toggle.checked = false;
    }

    this.updateStatusUI('Camera unavailable', 'outline');

    if (this.elements.standbyPlaceholder) {
      this.elements.standbyPlaceholder.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 32px; color: var(--color-outline);">videocam_off</span>
        <span class="font-mono" style="font-size: 11px; color: var(--color-outline); font-weight: 600;">Camera unavailable</span>
        <span style="font-size: 11px; color: var(--color-on-surface-variant); max-width: 220px; margin-top: 2px;">
          Using tab-switch detection only
        </span>
      `;
    }

    console.log(`[Camera] Fallback: Tab detection active. Camera offline (${reason})`);
  },

  /**
   * Starts a two-pose guided calibration phase:
   * Step 1: "Look at your screen" for 3 seconds
   * Step 2: "Now look down at your phone" for 3 seconds
   */
  startCalibration() {
    this.isCalibrating = true;
    this.isCalibrated = false;
    this.calibrationStep = 1;
    this.calibrationStartTime = Date.now();
    this.screenSamples = [];
    this.phoneSamples = [];
    this.calibrationSamples = []; // backward compatibility
    this.faceAwayStartTime = null;
    this.lookingDownStartTime = null;
    this.phoneStartTime = null;
    this.calibrationError = null;

    this.showCalibrationUI();
    if (this.elements.recalibrateBtn) {
      this.elements.recalibrateBtn.style.display = 'none';
    }
    if (this.elements.hudStatusPill) {
      this.elements.hudStatusPill.className = 'camera-status-pill calibrating';
      this.elements.hudStatusPill.textContent = 'CALIBRATING...';
    }
    this.updateCalibrationProgress(0, 'Look at your screen (3s)...');
    console.log('[Camera] Two-pose calibration started: Step 1 - Look at your screen for 3 seconds');
  },

  recordCalibrationSample(sample) {
    if (!this.isCalibrating) return;

    const now = Date.now();
    const elapsed = now - this.calibrationStartTime;

    if (this.calibrationStep === 1) {
      this.screenSamples.push(sample);
      this.calibrationSamples.push(sample); // backward compat
      const stepElapsed = elapsed;
      const progress = Math.min(50, Math.round((stepElapsed / CALIBRATION_STEP_DURATION_MS) * 50));
      const secondsLeft = Math.max(1, Math.ceil((CALIBRATION_STEP_DURATION_MS - stepElapsed) / 1000));
      this.updateCalibrationProgress(progress, `Look at your screen (${secondsLeft}s)...`);

      if (stepElapsed >= CALIBRATION_STEP_DURATION_MS) {
        console.log('[Camera] Step 1 complete. Starting Step 2: Now look down at your phone for 3 seconds');
        this.calibrationStep = 2;
        this.calibrationStartTime = now;
        this.updateCalibrationProgress(50, `Now look down at your phone (3s)...`);
      }
    } else if (this.calibrationStep === 2) {
      this.phoneSamples.push(sample);
      const stepElapsed = elapsed;
      const progress = Math.min(100, 50 + Math.round((stepElapsed / CALIBRATION_STEP_DURATION_MS) * 50));
      const secondsLeft = Math.max(1, Math.ceil((CALIBRATION_STEP_DURATION_MS - stepElapsed) / 1000));
      this.updateCalibrationProgress(progress, `Now look down at your phone (${secondsLeft}s)...`);

      if (stepElapsed >= CALIBRATION_STEP_DURATION_MS) {
        this.finishCalibration();
      }
    }
  },

  finishCalibration() {
    this.isCalibrating = false;

    const calcAverage = (samples, fallback = { yaw: 0, pitch: 0, gazeDown: 0 }) => {
      if (!samples || samples.length === 0) return fallback;
      const count = samples.length;
      return {
        yaw: Math.round((samples.reduce((s, x) => s + x.yaw, 0) / count) * 10) / 10,
        pitch: Math.round((samples.reduce((s, x) => s + x.pitch, 0) / count) * 10) / 10,
        gazeDown: Math.round((samples.reduce((s, x) => s + x.gazeDown, 0) / count) * 100) / 100
      };
    };

    // Calculate Step 1 average (screen pose baseline)
    if (this.screenSamples.length > 0) {
      this.baseline = calcAverage(this.screenSamples);
    } else if (this.calibrationSamples.length > 0) {
      this.baseline = calcAverage(this.calibrationSamples);
    } else {
      this.baseline = { yaw: 0, pitch: 0, gazeDown: 0 };
    }

    // Calculate Step 2 average (phone pose)
    if (this.phoneSamples.length > 0) {
      this.phonePose = calcAverage(this.phoneSamples);
    } else {
      this.phonePose = { yaw: this.baseline.yaw, pitch: this.baseline.pitch, gazeDown: this.baseline.gazeDown };
    }

    const pitchDiff = this.phonePose.pitch - this.baseline.pitch;
    const rawRange = Math.abs(pitchDiff);

    // Rule 5: If calibration fails (the two poses are too similar, range < 3 degrees)
    if (rawRange < MIN_CALIBRATION_RANGE_DEG) {
      this.isCalibrated = false;
      this.calibrationError = "Calibration didn't detect a difference, try again";
      console.warn(`[Camera] Calibration failed: range ${rawRange.toFixed(1)}° < ${MIN_CALIBRATION_RANGE_DEG}°. Tracking disabled.`);
      this.showCalibrationFailure(this.calibrationError);
      return;
    }

    // Learn the direction and range automatically:
    // dir = sign(phonePose.pitch - baseline.pitch), range = max(|phonePose.pitch - baseline.pitch|, 8)
    this.dir = Math.sign(pitchDiff) || 1;
    this.range = Math.max(rawRange, 8);
    this.isCalibrated = true;
    this.calibrationError = null;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('focustube_camera_baseline', JSON.stringify({
          baseline: this.baseline,
          phonePose: this.phonePose,
          dir: this.dir,
          range: this.range
        }));
      }
    } catch (e) {}

    this.hideCalibrationUI();
    if (this.elements.recalibrateBtn) {
      this.elements.recalibrateBtn.style.display = 'inline-flex';
      this.elements.recalibrateBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 14px;">restart_alt</span>
        <span>Recalibrate</span>
      `;
    }
    if (this.elements.hudStatusPill) {
      this.elements.hudStatusPill.className = 'camera-status-pill focused';
      this.elements.hudStatusPill.textContent = 'ATTENTIVE';
    }
    this.updateStatusUI('Active', 'secondary');

    console.log('[Camera] Calibration complete! Baseline:', this.baseline, 'PhonePose:', this.phonePose, `dir: ${this.dir}, range: ${this.range}°`);
  },

  showCalibrationFailure(message) {
    this.isCalibrated = false;
    this.updateStatusUI("Calibration didn't detect a difference, try again", 'warning');

    if (this.elements.calibrationText) {
      this.elements.calibrationText.textContent = message;
    }
    if (this.elements.calibrationProgress) {
      this.elements.calibrationProgress.style.width = '0%';
    }
    if (this.elements.hudStatusPill) {
      this.elements.hudStatusPill.className = 'camera-status-pill away';
      this.elements.hudStatusPill.textContent = 'CALIBRATE FIRST';
    }
    if (this.elements.recalibrateBtn) {
      this.elements.recalibrateBtn.style.display = 'inline-flex';
      this.elements.recalibrateBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 14px;">restart_alt</span>
        <span>Try again</span>
      `;
    }

    setTimeout(() => {
      if (!this.isCalibrated && !this.isCalibrating) {
        this.hideCalibrationUI();
      }
    }, 3500);
  },

  showCalibrationUI() {
    if (this.elements.calibrationOverlay) {
      this.elements.calibrationOverlay.style.display = 'flex';
    }
    this.updateCalibrationProgress(0, 'Look at your screen (3s)...');
  },

  updateCalibrationProgress(pct, message) {
    if (this.elements.calibrationProgress) {
      this.elements.calibrationProgress.style.width = `${pct}%`;
    }
    if (this.elements.calibrationText && message) {
      this.elements.calibrationText.textContent = message;
    }
  },

  hideCalibrationUI() {
    if (this.elements.calibrationOverlay) {
      this.elements.calibrationOverlay.style.display = 'none';
    }
  },

  /**
   * Main inference loop:
   * - FaceLandmarker runs at ~TARGET_FPS (~6 FPS)
   * - ObjectDetector runs at ~OBJECT_DETECTOR_FPS (~2 FPS)
   */
  startDetectionLoop() {
    const cycleMs = Math.round(1000 / TARGET_FPS); // ~166ms for 6 FPS

    const loop = (timestamp) => {
      if (!this.isEnabled) return;

      if (!this.lastInferenceTime || (timestamp - this.lastInferenceTime) >= cycleMs) {
        this.lastInferenceTime = timestamp;
        this.runInference(timestamp);
      }

      this.detectionTimer = requestAnimationFrame(loop);
    };

    this.detectionTimer = requestAnimationFrame(loop);
  },

  runInference(timestamp) {
    const hiddenVid = this.elements.hiddenVideo;
    if (!hiddenVid || hiddenVid.readyState < 2 || hiddenVid.paused) return;

    // 1. Run FaceLandmarker inference (~6 FPS)
    if (this.faceLandmarker) {
      try {
        const results = this.faceLandmarker.detectForVideo(hiddenVid, timestamp);
        this.processLandmarkResults(results);

        // Track FPS
        this.fpsCounter++;
        if (timestamp - this.lastFpsCheck >= 1000) {
          this.measuredFPS = this.fpsCounter;
          this.fpsCounter = 0;
          this.lastFpsCheck = timestamp;
          if (this.elements.hudFpsText) {
            this.elements.hudFpsText.textContent = `${this.measuredFPS} FPS`;
          }
        }
      } catch (err) {
        console.warn('[Camera] FaceLandmarker inference error:', err);
      }
    }

    // 2. Run ObjectDetector inference at ~2 FPS (every 500ms)
    const objectCycleMs = Math.round(1000 / OBJECT_DETECTOR_FPS);
    if (this.objectDetector && (!this.lastObjectInferenceTime || (timestamp - this.lastObjectInferenceTime) >= objectCycleMs)) {
      this.lastObjectInferenceTime = timestamp;
      try {
        const objResults = this.objectDetector.detectForVideo(hiddenVid, timestamp);
        this.processObjectResults(objResults);
      } catch (objErr) {
        console.warn('[Camera] ObjectDetector inference error:', objErr);
      }
    }
  },

  /**
   * Evaluates detected objects for cell phone class (score >= 0.4)
   */
  processObjectResults(objResults) {
    let phoneFound = false;
    let maxScore = 0;

    if (objResults && objResults.detections && objResults.detections.length > 0) {
      for (const det of objResults.detections) {
        for (const cat of det.categories || []) {
          const name = (cat.categoryName || '').toLowerCase();
          if ((name === 'cell phone' || name === 'phone' || name.includes('phone')) && cat.score >= PHONE_SCORE_THRESHOLD) {
            phoneFound = true;
            if (cat.score > maxScore) maxScore = cat.score;
          }
        }
      }
    }

    this.isPhoneDetected = phoneFound;
    this.phoneScore = maxScore;
  },

  /**
   * Decomposes column-major 4x4 matrix using Three.js XYZ Euler formula.
   * Returns { pitch, yaw, roll } in degrees.
   */
  calculateEulerFromMatrix(matrix) {
    if (!matrix || matrix.length < 16) {
      return { pitch: 0, yaw: 0, roll: 0 };
    }

    // Matrix elements in column-major order (matching Three.js Matrix4.elements):
    // m11 = matrix[0], m12 = matrix[4], m13 = matrix[8]
    // m21 = matrix[1], m22 = matrix[5], m23 = matrix[9]
    // m31 = matrix[2], m32 = matrix[6], m33 = matrix[10]
    const m11 = matrix[0], m12 = matrix[4], m13 = matrix[8];
    const m21 = matrix[1], m22 = matrix[5], m23 = matrix[9];
    const m31 = matrix[2], m32 = matrix[6], m33 = matrix[10];

    const clampM13 = Math.max(-1, Math.min(1, m13));
    const yRad = Math.asin(clampM13);
    let xRad = 0;
    let zRad = 0;

    if (Math.abs(clampM13) < 0.9999999) {
      xRad = Math.atan2(-m23, m33);
      zRad = Math.atan2(-m12, m11);
    } else {
      xRad = Math.atan2(m32, m22);
      zRad = 0;
    }

    const toDeg = 180 / Math.PI;
    return {
      pitch: xRad * toDeg, // X-axis rotation: pitch
      yaw: yRad * toDeg,   // Y-axis rotation: yaw
      roll: zRad * toDeg   // Z-axis rotation: roll
    };
  },

  calculateYawFromMatrix(matrix) {
    const euler = this.calculateEulerFromMatrix(matrix);
    return Math.abs(euler.yaw);
  },

  calculatePitchFromMatrix(matrix) {
    const euler = this.calculateEulerFromMatrix(matrix);
    return euler.pitch;
  },

  /**
   * Geometric Yaw estimation using landmark relative ratios
   */
  calculateYawFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 455) return 0;
    const nose = landmarks[1];
    const leftFace = landmarks[234];
    const rightFace = landmarks[454];

    if (!nose || !leftFace || !rightFace) return 0;

    const faceWidth = Math.abs(rightFace.x - leftFace.x);
    if (faceWidth === 0) return 0;

    const ratio = (nose.x - Math.min(leftFace.x, rightFace.x)) / faceWidth;
    const deviation = Math.abs(ratio - 0.5) * 2; // 0..1
    return Math.round(deviation * 65);
  },

  /**
   * Extracts average of eyeLookDownLeft and eyeLookDownRight blendshapes (0.0 to 1.0)
   */
  extractGazeDown(faceBlendshapes) {
    if (!faceBlendshapes || faceBlendshapes.length === 0) return 0;
    const categories = faceBlendshapes[0].categories || [];
    let left = 0;
    let right = 0;
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      if (cat.categoryName === 'eyeLookDownLeft') {
        left = cat.score;
      } else if (cat.categoryName === 'eyeLookDownRight') {
        right = cat.score;
      }
    }
    return (left + right) / 2;
  },

  /**
   * Evaluates face landmarks, transformation matrix, and blendshapes
   */
  processLandmarkResults(results) {
    const hasFace = results && results.faceLandmarks && results.faceLandmarks.length > 0;
    let yaw = 0;
    let pitch = 0;
    let gazeDown = 0;

    if (hasFace) {
      if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
        const matrix = results.facialTransformationMatrixes[0].data;
        const euler = this.calculateEulerFromMatrix(matrix);
        yaw = Math.abs(euler.yaw);
        pitch = euler.pitch;
      }

      const geomYaw = this.calculateYawFromLandmarks(results.faceLandmarks[0]);
      yaw = Math.max(yaw, geomYaw);
      gazeDown = this.extractGazeDown(results.faceBlendshapes);
    } else {
      yaw = 90;
    }

    this.currentYaw = Math.round(yaw);
    this.currentPitch = Math.round(pitch * 10) / 10;
    this.currentGazeDown = Math.round(gazeDown * 100) / 100;

    // Calibration recording
    if (this.isCalibrating) {
      if (hasFace) {
        this.recordCalibrationSample({
          yaw: this.currentYaw,
          pitch: this.currentPitch,
          gazeDown: this.currentGazeDown
        });
      }
      this.updateDebugOverlay();
      return;
    }

    // If calibration failed or has not completed, keep tracking disabled
    if (!this.isCalibrated) {
      this.updateHUD(hasFace, false, false, false);
      this.updateDebugOverlay();
      return;
    }

    // Normal detection: Compute downness = ((pitch - baseline.pitch) * dir) / range
    const pitchDelta = this.currentPitch - this.baseline.pitch;
    this.currentDownness = Math.round(((pitchDelta * this.dir) / this.range) * 100) / 100;
    const gazeDownDelta = this.currentGazeDown - this.baseline.gazeDown;
    const absYawDelta = Math.abs(this.currentYaw - this.baseline.yaw);

    // Rule 1: Face Away / Yaw (existing rules)
    const isFaceAwayCandidate = !hasFace || absYawDelta >= YAW_THRESHOLD_DEG;

    // Rule 2: Looking Down (disabled if taking notes)
    // Downness > 0.6 OR gazeDown delta >= 0.3 combined with slight down (downness > 0.3)
    const isGazeLookingDown = gazeDownDelta >= GAZE_DOWN_DELTA_THRESHOLD && this.currentDownness > 0.3;
    const isLookingDownCandidate = !this.isTakingNotes && hasFace && (
      this.currentDownness > DOWN_THRESHOLD_NORMALIZED || isGazeLookingDown
    );

    // Rule 3: Phone Visible with head slightly down (downness > 0.3)
    const isHeadSlightlyDown = this.currentDownness > 0.3;
    const isPhoneCandidate = hasFace && this.isPhoneDetected && isHeadSlightlyDown;

    this.evaluateAttentionTriggers({
      now: Date.now(),
      hasFace,
      isFaceAwayCandidate,
      isLookingDownCandidate,
      isPhoneCandidate
    });
  },

  /**
   * Tracks candidate state durations and triggers distractions:
   * - phone_visible: 1.5s
   * - looking_down: 3.0s
   * - face_away: 1.5s
   */
  evaluateAttentionTriggers({ now, hasFace, isFaceAwayCandidate, isLookingDownCandidate, isPhoneCandidate }) {
    let triggeredType = null;

    // 1. Check phone visible candidate
    if (isPhoneCandidate) {
      if (!this.phoneStartTime) this.phoneStartTime = now;
      if (now - this.phoneStartTime >= PHONE_VISIBLE_DURATION_MS) {
        triggeredType = 'phone_visible';
      }
    } else {
      this.phoneStartTime = null;
    }

    // 2. Check looking down candidate
    if (isLookingDownCandidate && !triggeredType) {
      if (!this.lookingDownStartTime) this.lookingDownStartTime = now;
      if (now - this.lookingDownStartTime >= LOOKING_DOWN_DURATION_MS) {
        triggeredType = 'looking_down';
      }
    } else {
      this.lookingDownStartTime = null;
    }

    // 3. Check face away candidate
    if (isFaceAwayCandidate && !triggeredType) {
      if (!this.faceAwayStartTime) this.faceAwayStartTime = now;
      if (now - this.faceAwayStartTime >= FACE_AWAY_DURATION_MS) {
        triggeredType = 'face_away';
      }
    } else {
      this.faceAwayStartTime = null;
    }

    if (triggeredType) {
      if (!this.isCurrentlyLookingAway) {
        this.isCurrentlyLookingAway = true;
        this.activeDistractionType = triggeredType;
        this.triggerDistraction(triggeredType);
      }
    } else if (!isPhoneCandidate && !isLookingDownCandidate && !isFaceAwayCandidate) {
      if (this.isCurrentlyLookingAway) {
        this.isCurrentlyLookingAway = false;
        this.activeDistractionType = null;
        this.handleAttentionReturn();
      }
    }

    this.updateHUD(hasFace, isPhoneCandidate, isLookingDownCandidate, isFaceAwayCandidate);
    this.updateDebugOverlay();
  },

  /**
   * Pauses playback, pauses timer, logs distraction with exact type, and shows Focus Lost overlay.
   * Gated: detection must only log distractions while a session is running.
   */
  triggerDistraction(type) {
    const isSessionRunning = typeof window !== 'undefined' && window.FocusTubeFocus && typeof window.FocusTubeFocus.isSessionActive === 'function'
      ? window.FocusTubeFocus.isSessionActive()
      : false;

    if (!isSessionRunning) {
      console.log(`[Camera] Attention diverted (${type}), but session is not running. Distraction not logged.`);
      return;
    }

    console.warn(`[Camera] Attention lost (${type}) during active session. Triggering distraction.`);
    if (typeof window !== 'undefined' && window.FocusTubeFocus) {
      window.FocusTubeFocus.handleFocusLoss(type);
    }
  },

  // Backward compatibility method
  triggerFaceAwayDistraction() {
    this.triggerDistraction('face_away');
  },

  /**
   * Called when user returns attention to screen
   */
  handleAttentionReturn() {
    console.log('[Camera] User returned attention to screen.');
    if (typeof window !== 'undefined' && window.FocusTubeFocus) {
      if (window.FocusTubeFocus.isAway && window.FocusTubeFocus.pendingLoss &&
         (window.FocusTubeFocus.pendingLoss.type === 'face_away' ||
          window.FocusTubeFocus.pendingLoss.type === 'looking_down' ||
          window.FocusTubeFocus.pendingLoss.type === 'phone_visible')) {
        window.FocusTubeFocus.handleFocusReturn();
      }
    }
  },

  // Backward compatibility alias
  handleFaceReturn() {
    this.handleAttentionReturn();
  },

  /**
   * Updates camera preview HUD overlay live at all times
   */
  updateHUD(hasFace, isPhone, isLookingDown, isFaceAway) {
    if (!this.elements.hudStatusPill) return;

    if (this.isCalibrating) {
      this.elements.hudStatusPill.className = 'camera-status-pill calibrating';
      this.elements.hudStatusPill.textContent = 'CALIBRATING...';
    } else if (!this.isCalibrated) {
      this.elements.hudStatusPill.className = 'camera-status-pill away';
      this.elements.hudStatusPill.textContent = 'CALIBRATE FIRST';
    } else if (!hasFace) {
      this.elements.hudStatusPill.className = 'camera-status-pill noface';
      this.elements.hudStatusPill.textContent = 'NO FACE';
    } else if (isPhone) {
      this.elements.hudStatusPill.className = 'camera-status-pill away';
      this.elements.hudStatusPill.textContent = 'PHONE';
    } else if (isLookingDown) {
      this.elements.hudStatusPill.className = 'camera-status-pill away';
      this.elements.hudStatusPill.textContent = 'LOOKING DOWN';
    } else if (isFaceAway) {
      this.elements.hudStatusPill.className = 'camera-status-pill away';
      this.elements.hudStatusPill.textContent = 'AWAY';
    } else if (this.isTakingNotes) {
      this.elements.hudStatusPill.className = 'camera-status-pill focused';
      this.elements.hudStatusPill.textContent = 'TAKING NOTES';
    } else {
      this.elements.hudStatusPill.className = 'camera-status-pill focused';
      this.elements.hudStatusPill.textContent = 'ATTENTIVE';
    }

    if (this.elements.hudYawText) {
      this.elements.hudYawText.textContent = `Yaw: ${this.currentYaw}° / ${YAW_THRESHOLD_DEG}° max`;
    }
  },

  /**
   * Ensures the ?debug=1 overlay exists and updates live telemetry metrics:
   * yaw, pitch, downness, gazeDown, and phone yes/no live.
   */
  ensureDebugOverlay() {
    if (!this.isDebugMode || typeof document === 'undefined') return;
    let el = document.getElementById('camera-debug-overlay');
    if (!el && this.elements.previewBox) {
      el = document.createElement('div');
      el.id = 'camera-debug-overlay';
      el.className = 'camera-debug-overlay';
      this.elements.previewBox.appendChild(el);
    }
    this.elements.debugOverlay = el;
    this.updateDebugOverlay();
  },

  updateDebugOverlay() {
    if (!this.isDebugMode || !this.elements.debugOverlay) return;

    const downnessFormatted = typeof this.currentDownness === 'number' ? this.currentDownness.toFixed(2) : '0.00';
    const phoneText = this.isPhoneDetected ? 'YES' : 'NO';

    this.elements.debugOverlay.innerHTML = `
      <div style="font-weight: 700; color: #c0c1ff; margin-bottom: 2px;">CAMERA TELEMETRY (?debug=1)</div>
      <div>Yaw: ${this.currentYaw}°</div>
      <div>Pitch: ${this.currentPitch}°</div>
      <div>Downness: ${downnessFormatted}</div>
      <div>GazeDown: ${this.currentGazeDown}</div>
      <div>Phone: <span style="color: ${this.isPhoneDetected ? 'var(--color-tertiary)' : 'var(--color-secondary)'}">${phoneText}</span></div>
      <div style="font-size: 10px; color: var(--color-outline); margin-top: 2px;">dir: ${this.dir >= 0 ? '+' : '-'}${Math.abs(this.dir)}, range: ${this.range}°, notes: ${this.isTakingNotes ? 'ON' : 'OFF'}</div>
    `;
    this.elements.debugOverlay.style.display = 'block';
  },

  updateStatusUI(text, variant = 'secondary') {
    if (this.elements.statusBadge) {
      this.elements.statusBadge.textContent = text;
      if (variant === 'secondary') {
        this.elements.statusBadge.className = 'engine-tag';
        this.elements.statusBadge.style.color = 'var(--color-secondary)';
      } else if (variant === 'warning') {
        this.elements.statusBadge.className = 'engine-tag';
        this.elements.statusBadge.style.color = 'var(--color-tertiary)';
      } else {
        this.elements.statusBadge.className = 'engine-tag';
        this.elements.statusBadge.style.color = 'var(--color-outline)';
      }
    }
  },

  showActiveUI() {
    this.updateStatusUI('Active', 'secondary');
    if (this.elements.standbyPlaceholder) this.elements.standbyPlaceholder.style.display = 'none';
    if (this.elements.previewVideo) this.elements.previewVideo.style.display = 'block';
    if (this.elements.hudOverlay) this.elements.hudOverlay.style.display = 'flex';
  },

  showStandbyUI() {
    this.updateStatusUI('Standby', 'outline');
    if (this.elements.standbyPlaceholder) this.elements.standbyPlaceholder.style.display = 'flex';
    if (this.elements.previewVideo) this.elements.previewVideo.style.display = 'none';
    if (this.elements.hudOverlay) this.elements.hudOverlay.style.display = 'none';
  }
};

// Guard environments for modular usage in browser and unit testing in Node
if (typeof window !== 'undefined') {
  window.FocusTubeCamera = FocusTubeCamera;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubeCamera.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FocusTubeCamera;
}
