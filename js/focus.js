/**
 * FocusTube - Focus Detection & Distraction Telemetry Module
 * Monitors tab visibility and window blur/focus, detects distraction moments,
 * enforces 1s debounce, manages Stitch Focus Lost overlay, updates live telemetry,
 * and persists the session data model to localStorage.
 */

const FocusTubeFocus = {
  // Active session tracking state (PRD Data Model)
  session: {
    videoId: 'mit-1806-l01',
    startedAt: new Date().toISOString(),
    endedAt: null,
    pomodoro: { studyMin: 25, breakMin: 5 },
    distractions: []
  },

  isAway: false,
  pendingLoss: null,
  isWaitingForUserReturn: false,

  // Pre-departure warning & session state tracking
  sessionActive: false,
  lastExitIntentTime: 0,
  exitIntentTimeout: null,
  originalTitle: '',
  isTabTitleAlertActive: false,
  notificationsEnabled: true,

  // DOM element references
  elements: {},

  init() {
    this.sessionActive = false;
    if (typeof window !== 'undefined') {
      window.sessionActive = false;
    }
    this.loadSession();
    this.cacheElements();
    this.initNotificationSettings();
    this.bindEvents();
    this.updateTelemetryCard();
    console.log('[Focus] Focus Telemetry Module Initialized');
  },

  loadSession() {
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      const storedVideo = window.FocusTubeStorage.getCurrentVideo();
      const currentVideoId = storedVideo ? storedVideo.videoId : 'mit-1806-l01';

      const existingSession = window.FocusTubeStorage.getCurrentSession();
      if (existingSession && !existingSession.endedAt) {
        this.session = existingSession;
        this.session.videoId = currentVideoId;
      } else {
        this.session = {
          videoId: currentVideoId,
          startedAt: new Date().toISOString(),
          endedAt: null,
          pomodoro: { studyMin: 25, breakMin: 5 },
          distractions: []
        };
        this.saveSession();
      }
    }
  },

  saveSession() {
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      window.FocusTubeStorage.saveCurrentSession(this.session);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('focustube_current_session', JSON.stringify(this.session));
    }
  },

  cacheElements() {
    if (typeof document === 'undefined') return;
    this.originalTitle = document.title || 'Study Room — FocusTube';
    this.elements = {
      overlay: document.getElementById('focus-lost-overlay'),
      subtitle: document.getElementById('focus-lost-subtitle'),
      desc: document.getElementById('focus-lost-desc'),
      actionBox: document.getElementById('focus-lost-action-box'),
      returnBtn: document.getElementById('return-to-continue-btn'),
      statusDot: document.getElementById('focus-status-dot'),
      statusText: document.getElementById('focus-status-text'),
      statusDesc: document.getElementById('focus-status-desc'),
      scoreDisplay: document.getElementById('focus-score-display'),
      distractionsDisplay: document.getElementById('distractions-count-display'),
      exitBanner: document.getElementById('exit-intent-banner'),
      notificationToggle: document.getElementById('notification-toggle'),
      timerToggleBtn: document.getElementById('timer-toggle-btn')
    };
  },

  initNotificationSettings() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('focustube_notifications_enabled');
      if (stored !== null) {
        this.notificationsEnabled = stored === 'true';
      }
    }
    if (typeof document !== 'undefined') {
      const toggle = document.getElementById('notification-toggle');
      if (toggle) {
        toggle.checked = this.notificationsEnabled;
        toggle.addEventListener('change', (e) => {
          this.notificationsEnabled = e.target.checked;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('focustube_notifications_enabled', String(e.target.checked));
          }
        });
      }
    }
  },

  setSessionActive(val) {
    this.sessionActive = !!val;
    if (typeof window !== 'undefined') {
      window.sessionActive = !!val;
    }
  },

  /**
   * Checks if a focus block is actively running (video playing and timer running).
   * Pre-departure warnings must ONLY be active during this state:
   * - Never during breaks (timer.mode !== 'focus')
   * - Never after session ends (session.endedAt != null or timer.mode === 'completed')
   * - Never when video or timer is paused
   */
  isFocusBlockRunning() {
    if (!this.sessionActive) return false;
    if (this.session && this.session.endedAt) return false;
    if (typeof window === 'undefined') return false;

    // Check timer
    const timer = window.FocusTubeTimer;
    if (timer) {
      if (!timer.isRunning || timer.mode !== 'focus') {
        return false;
      }
    } else if (!this.sessionActive) {
      return false;
    }

    // Check player
    const player = window.FocusTubePlayer;
    if (player && typeof player.isPlaying === 'function') {
      if (!player.isPlaying()) {
        return false;
      }
    }

    return true;
  },

  /**
   * Helper: checks if a focus study session is currently running.
   */
  isSessionActive() {
    if (this.session && this.session.endedAt) return false;
    if (typeof window !== 'undefined' && window.FocusTubeTimer) {
      return window.FocusTubeTimer.isRunning && window.FocusTubeTimer.mode === 'focus';
    }
    return this.sessionActive;
  },

  /**
   * Exit-Intent Banner: non-blocking warning when mouse heads towards exit or leaves page
   * Triggers:
   * - Mouse entering top 30px while moving upward (consecutive clientY comparison)
   * - Document mouseleave with clientY <= 0
   * - Document mouseout through top edge (relatedTarget null, clientY <= 0)
   * Must only fire when departure alerts toggle is ON and session is running.
   * 10s cooldown, NOT logged as a distraction.
   */
  showExitIntentBanner(trigger = 'unknown') {
    if (!this.notificationsEnabled || !this.isFocusBlockRunning()) return;

    const now = Date.now();
    if (this.lastExitIntentTime && (now - this.lastExitIntentTime < 10000)) {
      return; // 10-second cooldown
    }
    this.lastExitIntentTime = now;

    console.log(`[DepartureAlert] Exit-intent banner displayed (trigger: ${trigger}). Not logged as a distraction.`);

    let banner = this.elements.exitBanner || (typeof document !== 'undefined' ? document.getElementById('exit-intent-banner') : null);
    if (!banner && typeof document !== 'undefined') {
      banner = document.createElement('div');
      banner.id = 'exit-intent-banner';
      banner.className = 'exit-intent-banner';
      banner.setAttribute('role', 'alert');
      banner.innerHTML = `
        <div class="exit-intent-content">
          <span class="material-symbols-outlined exit-intent-icon">warning</span>
          <span class="exit-intent-text">Leaving? Your video and timer will pause, and this counts as a distraction.</span>
        </div>
      `;
      document.body.prepend(banner);
      this.elements.exitBanner = banner;
    }

    if (!banner) return;

    banner.style.display = 'flex';
    if (typeof banner.offsetWidth !== 'undefined') {
      void banner.offsetWidth; // Reflow to guarantee transition activates
    }
    banner.classList.add('visible');

    if (this.exitIntentTimeout) {
      clearTimeout(this.exitIntentTimeout);
    }
    this.exitIntentTimeout = setTimeout(() => {
      this.hideExitIntentBanner();
    }, 3000); // Auto-hide after 3 seconds
  },

  hideExitIntentBanner() {
    const banner = this.elements.exitBanner || (typeof document !== 'undefined' ? document.getElementById('exit-intent-banner') : null);
    if (banner) {
      banner.classList.remove('visible');
      setTimeout(() => {
        if (!banner.classList.contains('visible')) {
          banner.style.display = 'none';
        }
      }, 350);
    }
  },

  setTabTitleAlert() {
    if (typeof document === 'undefined') return;
    if (document.title !== '⚠️ Come back to your session!') {
      this.originalTitle = document.title;
    }
    document.title = '⚠️ Come back to your session!';
    this.isTabTitleAlertActive = true;
    console.log('[DepartureAlert] Tab title alert activated: "⚠️ Come back to your session!"');
  },

  restoreTabTitle() {
    if (typeof document === 'undefined') return;
    if (this.isTabTitleAlertActive) {
      document.title = this.originalTitle || 'Study Room — FocusTube';
      this.isTabTitleAlertActive = false;
      console.log('[DepartureAlert] Tab title restored to original:', document.title);
    }
  },

  requestNotificationPermission() {
    if (!this.notificationsEnabled) return;
    const Notif = (typeof window !== 'undefined' && window.Notification) ? window.Notification : (typeof Notification !== 'undefined' ? Notification : null);
    if (!Notif) return;

    if (Notif.permission === 'default') {
      try {
        const req = Notif.requestPermission();
        if (req && typeof req.then === 'function') {
          req.then(permission => {
            console.log('[Focus] Notification permission:', permission);
          }).catch(err => {
            console.warn('[Focus] Notification permission error:', err);
          });
        }
      } catch (e) {
        console.warn('[Focus] Notification permission request error:', e);
      }
    }
  },

  sendDepartureNotification() {
    if (!this.notificationsEnabled) return;
    const Notif = (typeof window !== 'undefined' && window.Notification) ? window.Notification : (typeof Notification !== 'undefined' ? Notification : null);
    if (!Notif || Notif.permission !== 'granted') return;

    try {
      new Notif('FocusTube', {
        body: 'Your session is paused. Come back to continue.',
        tag: 'focustube-session-paused'
      });
      console.log('[DepartureAlert] System notification sent: "Your session is paused. Come back to continue."');
    } catch (err) {
      console.warn('[Focus] Failed to show Notification:', err);
    }
  },

  bindEvents() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    // 1. Exit-Intent Warning: Mouse enters top 30px while moving upward
    let lastClientY = null;
    document.addEventListener('mousemove', (e) => {
      if (!this.notificationsEnabled || !this.isFocusBlockRunning()) {
        lastClientY = typeof e.clientY === 'number' ? e.clientY : null;
        return;
      }
      const currentY = e.clientY;
      if (typeof currentY === 'number' && lastClientY !== null) {
        // Enters top 30px of viewport while moving upward (currentY < lastClientY)
        if (currentY <= 30 && currentY < lastClientY) {
          console.log(`[DepartureAlert] Mouse entered top 30px moving upward (y=${currentY}, lastY=${lastClientY})`);
          this.showExitIntentBanner('mousemove_upward_top30');
        }
      }
      lastClientY = currentY;
    });

    // 2. Document mouseleave with clientY <= 0
    document.addEventListener('mouseleave', (e) => {
      if (!this.notificationsEnabled || !this.isFocusBlockRunning()) return;
      if (typeof e.clientY === 'number' && e.clientY <= 0) {
        console.log(`[DepartureAlert] Mouse left document top edge (clientY=${e.clientY})`);
        this.showExitIntentBanner('mouseleave_top');
      }
    });

    // 3. Document mouseout leaving through top edge (no relatedTarget and clientY <= 0)
    document.addEventListener('mouseout', (e) => {
      if (!this.notificationsEnabled || !this.isFocusBlockRunning()) return;
      if (!e.relatedTarget && typeof e.clientY === 'number' && e.clientY <= 0) {
        console.log(`[DepartureAlert] Mouseout through viewport top edge (clientY=${e.clientY})`);
        this.showExitIntentBanner('mouseout_top');
      }
    });

    // 4. Beforeunload Leave-Site Dialog (active only while session is running)
    window.addEventListener('beforeunload', (e) => {
      if (this.sessionActive && this.isFocusBlockRunning()) {
        console.log('[DepartureAlert] beforeunload leave-site dialog triggered');
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // 3. Prevent beforeunload dialog on in-app navigation:
    // Capture phase intercepts before any links navigate or handlers run
    document.addEventListener('click', (e) => {
      const el = e.target.closest('a, button, .queue-item');
      if (!el) return;

      const href = (el.getAttribute('href') || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const text = (el.textContent || '').trim().toLowerCase();

      if (
        href.includes('summary.html') ||
        href.includes('index.html') ||
        id === 'choose-another-video-btn' ||
        id === 'next-queue-play-btn' ||
        id === 'next-queue-replay-btn' ||
        el.classList.contains('queue-item') ||
        text.includes('end session') ||
        text.includes('summary') ||
        text.includes('choose another video') ||
        text.includes('choose a lecture') ||
        text.includes('next lecture') ||
        text.includes('play next lecture')
      ) {
        this.setSessionActive(false);
      }
    }, true);

    // Explicit listeners for in-app navigation elements
    const clearSessionActive = () => this.setSessionActive(false);
    document.querySelectorAll('a[href*="summary.html"], a[href*="index.html"]').forEach(link => {
      link.addEventListener('click', clearSessionActive);
    });
    const chooseAnotherBtn = document.getElementById('choose-another-video-btn');
    if (chooseAnotherBtn) {
      chooseAnotherBtn.addEventListener('click', clearSessionActive);
    }
    const nextQueueBtn = document.getElementById('next-queue-play-btn');
    if (nextQueueBtn) {
      nextQueueBtn.addEventListener('click', clearSessionActive);
    }

    // 4. Hook Start Session button for Notification Permission & sessionActive
    if (this.elements.timerToggleBtn) {
      this.elements.timerToggleBtn.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.FocusTubeTimer && !window.FocusTubeTimer.isRunning) {
          if (window.FocusTubeTimer.mode === 'focus') {
            this.setSessionActive(true);
          }
        }
        this.requestNotificationPermission();
      });
    }

    // 5. Hook Timer & Player resume to activate sessionActive
    if (typeof window !== 'undefined' && window.FocusTubeTimer) {
      const origResume = window.FocusTubeTimer.resume;
      const self = this;
      window.FocusTubeTimer.resume = function(...args) {
        if (window.FocusTubeTimer.mode === 'focus') {
          self.setSessionActive(true);
        }
        return origResume.apply(this, args);
      };
    }
    if (typeof window !== 'undefined' && window.FocusTubePlayer) {
      const origPlay = window.FocusTubePlayer.play;
      const self = this;
      window.FocusTubePlayer.play = function(...args) {
        if (window.FocusTubeTimer && window.FocusTubeTimer.mode === 'focus') {
          self.setSessionActive(true);
        }
        return origPlay.apply(this, args);
      };
    }

    // 6. Page Visibility API
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        const wasRunning = this.isFocusBlockRunning();

        this.handleFocusLoss('tab_hidden');

        if (wasRunning) {
          this.setTabTitleAlert();
          this.sendDepartureNotification();
        }
      } else {
        this.restoreTabTitle();
        this.handleFocusReturn();
      }
    });

    // 7. Window Blur / Focus
    window.addEventListener('blur', () => {
      // If already hidden via tab_hidden, avoid double-triggering
      if (!document.hidden) {
        this.handleFocusLoss('window_blur');
      }
    });

    window.addEventListener('focus', () => {
      this.restoreTabTitle();
      if (!document.hidden) {
        this.handleFocusReturn();
      }
    });

    // Return to continue button
    if (this.elements.returnBtn) {
      this.elements.returnBtn.addEventListener('click', () => {
        this.confirmReturn();
      });
    }

    // Keyboard shortcut: Space or Enter to continue
    document.addEventListener('keydown', (e) => {
      if (this.isWaitingForUserReturn) {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.confirmReturn();
        }
      }
    });

    // Stage Demo Shortcut: Shift+D simulates a distraction at current video time
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        console.warn('[Focus] Stage Demo Shortcut (Shift+D) fired');
        this.simulateDemoDistraction();
      }
    });

    // End Session links
    document.querySelectorAll('a[href="summary.html"]').forEach(link => {
      link.addEventListener('click', () => {
        this.endSession();
      });
    });
  },

  /**
   * Stage Demo Helper: Simulates distraction at current video time
   * Pauses timer/video, shows overlay, and automatically enables return after 1.5s
   */
  simulateDemoDistraction() {
    if (!this.isSessionActive()) {
      if (typeof window !== 'undefined' && window.FocusTubeTimer && !window.FocusTubeTimer.isRunning) {
        window.FocusTubeTimer.resume();
      }
    }

    this.handleFocusLoss('tab_hidden');

    // Simulate return after 1.5s so "Return to continue" [Space] is ready on stage
    setTimeout(() => {
      if (this.isAway && this.pendingLoss) {
        this.handleFocusReturn();
      }
    }, 1500);
  },

  endSession() {
    this.setSessionActive(false);
    this.restoreTabTitle();
    this.hideExitIntentBanner();
    this.session.endedAt = new Date().toISOString();
    if (typeof window !== 'undefined' && window.FocusTubeTimer && typeof window.FocusTubeTimer.getElapsedSeconds === 'function') {
      const elapsed = window.FocusTubeTimer.getElapsedSeconds();
      // If user studied, record it, otherwise fallback to 25m for demo/testing
      this.session.totalStudyTimeSec = elapsed > 0 ? elapsed : 1500;
    } else {
      this.session.totalStudyTimeSec = 1500;
    }
    this.saveSession();
    console.log('[Focus] Study session ended:', this.session);
  },

  /**
   * Focus Loss Handler
   * @param {'tab_hidden' | 'window_blur'} type
   */
  handleFocusLoss(type) {
    // Only track focus loss if study session is actively running
    if (!this.isSessionActive()) {
      return;
    }

    // Prevent double-logging when visibilitychange and blur fire together
    if (this.isAway) {
      return;
    }

    this.isAway = true;
    this.isWaitingForUserReturn = false;

    // Capture exact video playback position
    let videoTime = 0;
    if (typeof window !== 'undefined' && window.FocusTubePlayer && typeof window.FocusTubePlayer.getCurrentTime === 'function') {
      videoTime = window.FocusTubePlayer.getCurrentTime();
    }

    const startedAt = Date.now();
    this.pendingLoss = {
      type: type || 'tab_hidden',
      videoTime: Math.floor(videoTime),
      wallTime: new Date(startedAt).toISOString(),
      startedAt: startedAt
    };

    console.warn(`[Focus] Focus Lost (${type}) at video timestamp ${this.formatTime(this.pendingLoss.videoTime)}`);

    // Pause timer and video immediately
    if (typeof window !== 'undefined') {
      if (window.FocusTubeTimer && window.FocusTubeTimer.isRunning) {
        window.FocusTubeTimer.pause();
      }
      if (window.FocusTubePlayer) {
        window.FocusTubePlayer.pause();
      }
    }

    // Update status card and render overlay in "away" state
    this.renderAwayState();
  },

  /**
   * Focus Return Handler
   */
  handleFocusReturn() {
    if (!this.isAway || !this.pendingLoss) {
      return;
    }

    const returnTime = Date.now();
    const durationMs = returnTime - this.pendingLoss.startedAt;

    // Debounce rule: ignore focus losses shorter than 1 second (1000ms)
    if (durationMs < 1000) {
      console.log(`[Focus] Focus loss discarded by debounce (${durationMs}ms < 1000ms)`);
      this.pendingLoss = null;
      this.isAway = false;
      this.isWaitingForUserReturn = false;
      this.hideOverlay();
      this.updateTelemetryCard();
      return;
    }

    // Valid distraction registered!
    const durationSec = Math.max(1, Math.round(durationMs / 1000));
    const activeVideoId = (window.FocusTubePlayer && window.FocusTubePlayer.youtubeVideoId)
      || (window.FocusTubeStorage && window.FocusTubeStorage.getCurrentVideo())?.videoId
      || this.session.videoId;

    const distraction = {
      videoId: activeVideoId,
      type: this.pendingLoss.type,
      videoTime: this.pendingLoss.videoTime,
      wallTime: this.pendingLoss.wallTime,
      durationSec: durationSec
    };

    this.session.distractions.push(distraction);
    if (window.FocusTubeStorage && typeof window.FocusTubeStorage.saveVideoDistraction === 'function') {
      window.FocusTubeStorage.saveVideoDistraction(distraction);
    }
    this.saveSession();

    console.warn(`[Focus] Distraction #${this.session.distractions.length} recorded:`, distraction);

    // Prompt user to continue manually (Never auto-resume on return)
    this.isWaitingForUserReturn = true;
    this.renderReturnPromptState(distraction);
    this.updateTelemetryCard();
  },

  /**
   * User clicked "Return to continue" (or pressed Space/Enter)
   */
  confirmReturn() {
    console.log('[Focus] User confirmed return to study session');
    this.restoreTabTitle();
    this.isAway = false;
    this.pendingLoss = null;
    this.isWaitingForUserReturn = false;

    this.hideOverlay();
    this.updateTelemetryCard();

    // Resume video and Pomodoro timer
    if (typeof window !== 'undefined') {
      if (window.FocusTubeTimer) {
        window.FocusTubeTimer.resume();
      }
      if (window.FocusTubePlayer) {
        window.FocusTubePlayer.play();
      }
    }
  },

  /**
   * Renders overlay when user is detected away
   */
  renderAwayState() {
    if (!this.elements.overlay) return;

    const distractionNum = this.session.distractions.length + 1;
    const timeStr = this.formatTime(this.pendingLoss ? this.pendingLoss.videoTime : 0);

    if (this.elements.subtitle) {
      this.elements.subtitle.textContent = `Distraction #${distractionNum} at ${timeStr}`;
    }
    if (this.elements.desc) {
      if (this.pendingLoss && this.pendingLoss.type === 'face_away') {
        this.elements.desc.textContent = `You looked away from the study session. Playback and timer paused automatically so you don't miss content.`;
      } else if (this.pendingLoss && this.pendingLoss.type === 'looking_down') {
        this.elements.desc.textContent = `You looked down away from the screen. Playback and timer paused automatically so you don't miss content.`;
      } else if (this.pendingLoss && this.pendingLoss.type === 'phone_visible') {
        this.elements.desc.textContent = `Phone detected during deep focus. Playback and timer paused automatically so you don't miss content.`;
      } else {
        this.elements.desc.textContent = `You left the study session. Playback and timer paused automatically so you don't miss content.`;
      }
    }
    if (this.elements.actionBox) {
      this.elements.actionBox.innerHTML = `
        <div style="font-size: var(--text-label-md); color: var(--color-outline); padding: 8px 16px;">
          Session paused • Waiting for focus return...
        </div>
      `;
    }

    this.elements.overlay.style.display = 'flex';

    // Set status card indicator to Away (amber)
    if (this.elements.statusDot) {
      this.elements.statusDot.classList.remove('active');
      this.elements.statusDot.classList.add('warning');
    }
    if (this.elements.statusText) {
      this.elements.statusText.textContent = 'Away';
      this.elements.statusText.style.color = 'var(--color-tertiary)';
    }
    if (this.elements.statusDesc) {
      let descText = 'Attention diverted';
      if (this.pendingLoss) {
        if (this.pendingLoss.type === 'face_away') descText = 'Gaze diverted';
        else if (this.pendingLoss.type === 'looking_down') descText = 'Looking down';
        else if (this.pendingLoss.type === 'phone_visible') descText = 'Phone detected';
      }
      this.elements.statusDesc.textContent = descText;
    }
  },

  /**
   * Renders overlay with "Return to continue" CTA when user is back on the page
   */
  renderReturnPromptState(lastDistraction) {
    if (!this.elements.overlay) return;

    const distractionNum = this.session.distractions.length;
    const timeStr = this.formatTime(lastDistraction ? lastDistraction.videoTime : 0);

    if (this.elements.subtitle) {
      let typeLabel = 'Distraction';
      if (lastDistraction) {
        if (lastDistraction.type === 'face_away') typeLabel = 'Gaze diverted';
        else if (lastDistraction.type === 'looking_down') typeLabel = 'Looked down';
        else if (lastDistraction.type === 'phone_visible') typeLabel = 'Phone detected';
      }
      this.elements.subtitle.textContent = `${typeLabel} #${distractionNum} at ${timeStr} (${lastDistraction.durationSec}s away)`;
    }
    if (this.elements.desc) {
      if (lastDistraction && lastDistraction.type === 'face_away') {
        this.elements.desc.textContent = `You looked away from the screen. Ready to re-engage with your study material?`;
      } else if (lastDistraction && lastDistraction.type === 'looking_down') {
        this.elements.desc.textContent = `You were looking down. Ready to re-engage with your study material?`;
      } else if (lastDistraction && lastDistraction.type === 'phone_visible') {
        this.elements.desc.textContent = `Put your phone aside to protect deep focus. Ready to continue?`;
      } else {
        this.elements.desc.textContent = `Session paused. Ready to re-engage with your study material?`;
      }
    }

    if (this.elements.actionBox) {
      this.elements.actionBox.innerHTML = `
        <button class="btn btn-primary" id="return-to-continue-btn" type="button" style="padding: 10px 24px;">
          <span class="material-symbols-outlined">play_arrow</span>
          <span>Return to continue</span>
          <span class="key-hint font-mono">[Space]</span>
        </button>
      `;
      const btn = document.getElementById('return-to-continue-btn');
      if (btn) {
        btn.focus();
        btn.addEventListener('click', () => this.confirmReturn());
      }
    }

    this.elements.overlay.style.display = 'flex';
  },

  hideOverlay() {
    if (this.elements.overlay) {
      this.elements.overlay.style.display = 'none';
    }
  },

  /**
   * Computes focus score according to PRD Section 8:
   * Focus Score = Focused Time / Total Session Time * 100
   * Focused Time = Total Session Time - Time Away
   */
  calculateFocusScore() {
    let focusedSec = 0;
    if (typeof window !== 'undefined' && window.FocusTubeTimer && typeof window.FocusTubeTimer.getElapsedSeconds === 'function') {
      focusedSec = window.FocusTubeTimer.getElapsedSeconds();
    }

    const totalAwaySec = (this.session.distractions || []).reduce((sum, d) => sum + (d.durationSec || 0), 0);
    const totalSessionSec = focusedSec + totalAwaySec;

    if (totalSessionSec === 0) return 100;
    return Math.max(0, Math.min(100, Math.round((focusedSec / totalSessionSec) * 100)));
  },

  /**
   * Updates Card 2 (Session Telemetry) live
   */
  updateTelemetryCard() {
    if (typeof document === 'undefined') return;

    const distractionCount = (this.session.distractions || []).length;
    const score = this.calculateFocusScore();

    // 1. Distraction count
    if (this.elements.distractionsDisplay) {
      this.elements.distractionsDisplay.textContent = String(distractionCount);
      this.elements.distractionsDisplay.style.color = distractionCount === 0 ? 'var(--color-secondary)' : 'var(--color-tertiary)';
    }

    // 2. Live Focus score
    if (this.elements.scoreDisplay) {
      this.elements.scoreDisplay.textContent = `${score}%`;
      this.elements.scoreDisplay.style.color = score >= 80 ? 'var(--color-on-surface)' : 'var(--color-tertiary)';
    }

    // 3. Status text & dot
    if (!this.isAway) {
      if (this.elements.statusDot) {
        this.elements.statusDot.classList.remove('warning');
        this.elements.statusDot.classList.add('active');
      }
      if (this.elements.statusText) {
        this.elements.statusText.textContent = 'Focused';
        this.elements.statusText.style.color = 'var(--color-secondary)';
      }
      if (this.elements.statusDesc) {
        this.elements.statusDesc.textContent = 'Facing screen';
      }
    }
  },

  formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
};

// Guard environments for modular usage in browser and unit testing in Node
if (typeof window !== 'undefined') {
  window.FocusTubeFocus = FocusTubeFocus;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubeFocus.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FocusTubeFocus };
}
