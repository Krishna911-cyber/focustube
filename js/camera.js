/**
 * FocusTube - Optional Camera Attention Detection Module
 * Powered by MediaPipe Face Landmarker (tasks-vision) running 100% on-device.
 * 
 * Requirements:
 * 1. Ask for camera permission only after the user toggles "Attention tracking" on.
 * 2. Never store or transmit frames (0 bytes leave the device).
 * 3. Run detection at 5-8 FPS on a small hidden video element, with small preview in the Camera card.
 * 4. Classify "looking away" when no face is detected or head yaw > threshold for > 1.5 seconds.
 * 5. When triggered, pause video and timer, log {type: "face_away"}, and show the Focus Lost overlay.
 * 6. If camera is denied or model fails to load, silently fall back to tab detection and show "Camera unavailable".
 */

// Core Constants
const YAW_THRESHOLD_DEG = 25;       // Degrees off-center for head yaw
const LOOK_AWAY_DURATION_MS = 1500; // 1.5 seconds away before triggering distraction
const TARGET_FPS = 6;               // Run detection at ~6 FPS (approx 166ms per cycle)
const MEDIAPIPE_VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';
const MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MEDIAPIPE_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const FocusTubeCamera = {
  // Constant references for testing & inspection
  YAW_THRESHOLD_DEG,
  LOOK_AWAY_DURATION_MS,
  TARGET_FPS,

  // State
  isEnabled: false,
  isInitializing: false,
  isAvailable: true,
  stream: null,
  faceLandmarker: null,
  detectionTimer: null,
  lastInferenceTime: 0,
  awayStartTime: null,
  isCurrentlyLookingAway: false,
  currentYaw: 0,
  measuredFPS: TARGET_FPS,
  fpsCounter: 0,
  lastFpsCheck: 0,

  // DOM Elements
  elements: {},

  init() {
    this.cacheElements();
    this.bindEvents();
    console.log('[Camera] FocusTube Camera Attention Module Initialized (Standby)');
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
      hiddenVideo: document.getElementById('camera-hidden-video')
    };
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
    // Show on-device processing notice before requesting webcam
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
   * Initializes MediaPipe FaceLandmarker and requests webcam stream
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
        this.elements.hudStatusPill.className = 'camera-status-pill focused';
        this.elements.hudStatusPill.textContent = 'CONNECTING...';
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

      // 3. Load MediaPipe Face Landmarker via CDN
      console.log('[Camera] Loading MediaPipe Face Landmarker...');
      const { FilesetResolver, FaceLandmarker } = await import(MEDIAPIPE_VISION_BUNDLE);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_MODEL_PATH
        },
        runningMode: 'VIDEO',
        outputFacialTransformationMatrixes: true,
        numFaces: 1
      });

      console.log('[Camera] MediaPipe Face Landmarker loaded successfully!');

      // 4. Activate detection loop at ~TARGET_FPS (5-8 FPS)
      this.isEnabled = true;
      this.isInitializing = false;
      this.isAvailable = true;
      this.showActiveUI();
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

    this.awayStartTime = null;
    this.isCurrentlyLookingAway = false;
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
   * Main inference loop running at 5-8 FPS
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
    if (!this.faceLandmarker) return;

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
      console.warn('[Camera] Inference error:', err);
    }
  },

  /**
   * Evaluates face presence and head yaw against thresholds
   */
  processLandmarkResults(results) {
    const hasFace = results && results.faceLandmarks && results.faceLandmarks.length > 0;
    let yawDeg = 0;

    if (hasFace) {
      const landmarks = results.faceLandmarks[0];

      // 1. Estimate Yaw from transformation matrix if available
      if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
        const matrix = results.facialTransformationMatrixes[0].data;
        yawDeg = this.calculateYawFromMatrix(matrix);
      }

      // 2. Complementary Yaw estimation from 3D Landmark Geometry
      const geomYaw = this.calculateYawFromLandmarks(landmarks);
      // Use the maximum deviation for robust attention monitoring
      this.currentYaw = Math.round(Math.max(Math.abs(yawDeg), Math.abs(geomYaw)));
    } else {
      this.currentYaw = 90; // Face not in frame
    }

    // Classification Rule:
    // "looking away" when no face is detected OR head yaw > YAW_THRESHOLD_DEG for > 1.5s
    const isAwayCandidate = !hasFace || this.currentYaw > YAW_THRESHOLD_DEG;

    this.handleAttentionClassification(isAwayCandidate, hasFace, this.currentYaw);
  },

  /**
   * Decomposes column-major 4x4 matrix to compute Yaw angle in degrees
   */
  calculateYawFromMatrix(matrix) {
    if (!matrix || matrix.length < 16) return 0;
    // In column-major 4x4 matrix:
    // col 0: [0, 1, 2, 3]
    // col 2: [8, 9, 10, 11]
    const r02 = matrix[8];
    const r22 = matrix[10];
    const yawRad = Math.atan2(r02, r22);
    return Math.abs(yawRad * (180 / Math.PI));
  },

  /**
   * Geometric Yaw estimation using landmark relative ratios
   * Nose tip (#1) position relative to left (#234) and right (#454) face margins
   */
  calculateYawFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 455) return 0;
    const nose = landmarks[1];
    const leftFace = landmarks[234];
    const rightFace = landmarks[454];

    if (!nose || !leftFace || !rightFace) return 0;

    const faceWidth = Math.abs(rightFace.x - leftFace.x);
    if (faceWidth === 0) return 0;

    // Normal frontal facing ratio is ~0.50
    const ratio = (nose.x - Math.min(leftFace.x, rightFace.x)) / faceWidth;
    const deviation = Math.abs(ratio - 0.5) * 2; // 0 (straight) to 1.0 (full profile)

    // Maps 0..1 to approx 0..65 degrees
    return Math.round(deviation * 65);
  },

  /**
   * Enforces the 1.5-second time window before triggering a focus loss
   */
  handleAttentionClassification(isAwayCandidate, hasFace, yaw) {
    const now = Date.now();

    if (isAwayCandidate) {
      if (!this.awayStartTime) {
        this.awayStartTime = now;
      }

      const awayElapsed = now - this.awayStartTime;

      // Update HUD to away candidate state
      this.updateHUD(false, hasFace, yaw);

      // Trigger distraction if away for > 1.5 seconds (LOOK_AWAY_DURATION_MS)
      if (awayElapsed >= LOOK_AWAY_DURATION_MS && !this.isCurrentlyLookingAway) {
        this.isCurrentlyLookingAway = true;
        this.triggerFaceAwayDistraction();
      }
    } else {
      // User is facing screen attentively
      this.awayStartTime = null;
      this.updateHUD(true, true, yaw);

      if (this.isCurrentlyLookingAway) {
        this.isCurrentlyLookingAway = false;
        this.handleFaceReturn();
      }
    }
  },

  /**
   * Pauses playback, pauses timer, logs {type: "face_away"}, and shows Focus Lost overlay
   */
  triggerFaceAwayDistraction() {
    console.warn(`[Camera] Look-away registered (>1.5s). Triggering distraction handling.`);

    if (typeof window !== 'undefined' && window.FocusTubeFocus) {
      // Trigger focus loss with type: 'face_away'
      window.FocusTubeFocus.handleFocusLoss('face_away');
    }
  },

  /**
   * Called when user looks back at screen
   */
  handleFaceReturn() {
    console.log('[Camera] User returned attention to screen.');
    if (typeof window !== 'undefined' && window.FocusTubeFocus) {
      if (window.FocusTubeFocus.isAway && window.FocusTubeFocus.pendingLoss && window.FocusTubeFocus.pendingLoss.type === 'face_away') {
        window.FocusTubeFocus.handleFocusReturn();
      }
    }
  },

  updateHUD(isFocused, hasFace, yaw) {
    if (!this.elements.hudStatusPill) return;

    if (!hasFace) {
      this.elements.hudStatusPill.className = 'camera-status-pill noface';
      this.elements.hudStatusPill.textContent = 'NO FACE';
    } else if (isFocused) {
      this.elements.hudStatusPill.className = 'camera-status-pill focused';
      this.elements.hudStatusPill.textContent = 'ATTENTIVE';
    } else {
      this.elements.hudStatusPill.className = 'camera-status-pill away';
      this.elements.hudStatusPill.textContent = 'AWAY';
    }

    if (this.elements.hudYawText) {
      this.elements.hudYawText.textContent = `Yaw: ${yaw}° / ${YAW_THRESHOLD_DEG}° max`;
    }
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
