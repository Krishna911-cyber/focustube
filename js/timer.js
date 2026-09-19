/**
 * FocusTube - Pomodoro Timer Module
 * Handles study block countdowns, breaks, circular SVG progress ring,
 * bi-directional video sync, and exposed API methods for telemetry.
 */

const FocusTubeTimer = {
  // Config durations (in milliseconds)
  FOCUS_DURATION_MS: 25 * 60 * 1000, // 25 minutes
  BREAK_DURATION_MS: 5 * 60 * 1000,   // 5 minutes
  TOTAL_BLOCKS: 4,
  RING_CIRCUMFERENCE: 427.26, // 2 * Math.PI * 68

  // State
  mode: 'focus', // 'focus' | 'break'
  currentBlock: 1, // 1 to 4
  isRunning: false,
  startTime: null,
  elapsedBeforePauseMs: 0,
  totalFocusElapsedMs: 0,
  isDemoMode: false,
  intervalId: null,

  // DOM Elements cache
  elements: {},

  init() {
    this.checkDemoMode();
    this.cacheElements();
    this.restoreSessionState();
    this.bindEvents();
    this.render();
    console.log('[Timer] FocusTube Pomodoro Timer Initialized' + (this.isDemoMode ? ' (DEMO MODE: 1-minute blocks)' : ''));
  },

  checkDemoMode() {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1' || window.location.search.includes('demo=1')) {
        this.isDemoMode = true;
        this.FOCUS_DURATION_MS = 60 * 1000; // 1 minute focus block for live demo
        this.BREAK_DURATION_MS = 15 * 1000; // 15 seconds break
        const pill = document.getElementById('demo-mode-indicator-pill');
        if (pill) pill.style.display = 'inline-flex';
        console.log('[Timer] Demo mode active: 1-minute focus block unlocked (?demo=1)');
      }
    }
  },

  restoreSessionState() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('focustube_current_session');
      if (!raw) return;
      const session = JSON.parse(raw);
      if (session && !session.endedAt) {
        if (session.elapsedBeforePauseMs && session.elapsedBeforePauseMs > 0) {
          this.elapsedBeforePauseMs = session.elapsedBeforePauseMs;
          this.totalFocusElapsedMs = session.totalFocusElapsedMs || 0;
          this.currentBlock = session.currentBlock || 1;
          console.log(`[Timer] Restored mid-session timer state: ${Math.floor(this.elapsedBeforePauseMs / 1000)}s elapsed in block ${this.currentBlock}`);
        } else if (session.totalStudyTimeSec && session.totalStudyTimeSec > 0) {
          this.elapsedBeforePauseMs = Math.min(this.FOCUS_DURATION_MS, session.totalStudyTimeSec * 1000);
          console.log(`[Timer] Restored mid-session study time: ${session.totalStudyTimeSec}s`);
        }
      }
    } catch (e) {
      console.warn('[Timer] Error restoring session timer state:', e);
    }
  },

  persistTimerState() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('focustube_current_session');
      if (!raw) return;
      const session = JSON.parse(raw);
      session.elapsedBeforePauseMs = this.getCurrentElapsedMs();
      session.totalFocusElapsedMs = this.totalFocusElapsedMs;
      session.currentBlock = this.currentBlock;
      session.totalStudyTimeSec = this.getElapsedSeconds();
      if (this.isDemoMode) {
        session.pomodoro = { studyMin: 1, breakMin: 0.25 };
      }
      localStorage.setItem('focustube_current_session', JSON.stringify(session));
    } catch (e) {}
  },

  cacheElements() {
    if (typeof document === 'undefined') return;
    this.elements = {
      card: document.getElementById('pomodoro-timer-card'),
      blockLabel: document.getElementById('timer-block-label'),
      modeTag: document.getElementById('timer-mode-tag'),
      progressCircle: document.getElementById('timer-progress-circle'),
      display: document.getElementById('timer-display'),
      sublabel: document.getElementById('timer-sublabel'),
      toggleBtn: document.getElementById('timer-toggle-btn'),
      toggleIcon: document.getElementById('timer-toggle-icon'),
      toggleText: document.getElementById('timer-toggle-text'),
      resetBtn: document.getElementById('timer-reset-btn'),
      breakContainer: document.getElementById('timer-break-container'),
      breakText: document.getElementById('break-banner-text'),
      startBreakBtn: document.getElementById('timer-start-break-btn'),
      skipBreakBtn: document.getElementById('timer-skip-break-btn')
    };
  },

  bindEvents() {
    if (!this.elements) return;

    if (this.elements.toggleBtn) {
      this.elements.toggleBtn.addEventListener('click', () => {
        if (this.isRunning) {
          this.pause();
        } else {
          this.resume();
        }
      });
    }

    if (this.elements.resetBtn) {
      this.elements.resetBtn.addEventListener('click', () => {
        this.reset();
      });
    }

    if (this.elements.startBreakBtn) {
      this.elements.startBreakBtn.addEventListener('click', () => {
        this.resume();
        if (this.elements.breakContainer) {
          this.elements.breakContainer.style.display = 'none';
        }
      });
    }

    if (this.elements.skipBreakBtn) {
      this.elements.skipBreakBtn.addEventListener('click', () => {
        this.skipBreak();
      });
    }
  },

  getDurationMs() {
    return this.mode === 'focus' ? this.FOCUS_DURATION_MS : this.BREAK_DURATION_MS;
  },

  /**
   * Precise elapsed time in the current block/mode using Date.now() math.
   * Zero drift even under background tab throttling.
   */
  getCurrentElapsedMs() {
    if (this.isRunning && this.startTime) {
      return this.elapsedBeforePauseMs + (Date.now() - this.startTime);
    }
    return this.elapsedBeforePauseMs;
  },

  getRemainingMs() {
    const duration = this.getDurationMs();
    const elapsed = this.getCurrentElapsedMs();
    return Math.max(0, duration - elapsed);
  },

  /**
   * Exposed public method for other modules (e.g. Focus Telemetry, Summary).
   * Returns total focus seconds elapsed across this session.
   */
  getElapsedSeconds() {
    let currentBlockFocusMs = 0;
    if (this.mode === 'focus') {
      currentBlockFocusMs = this.getCurrentElapsedMs();
    }
    return Math.floor((this.totalFocusElapsedMs + currentBlockFocusMs) / 1000);
  },

  /**
   * Exposed public method: Resumes the timer and triggers synchronized video playback.
   */
  resume() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();

    // Start interval loop if not active
    if (!this.intervalId) {
      this.intervalId = setInterval(() => this.tick(), 250);
    }

    // Synchronize video playback (only during focus blocks)
    if (this.mode === 'focus' && typeof window !== 'undefined' && window.FocusTubePlayer) {
      window.FocusTubePlayer.play();
    }

    this.render();
    console.log(`[Timer] Resumed (${this.mode} block ${this.currentBlock})`);
  },

  /**
   * Exposed public method: Pauses the timer and triggers synchronized video pause.
   */
  pause() {
    if (!this.isRunning) return;

    // Accumulate elapsed ms
    if (this.startTime) {
      this.elapsedBeforePauseMs += (Date.now() - this.startTime);
      this.startTime = null;
    }
    this.isRunning = false;

    // Clear interval loop
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Synchronize video pause
    if (typeof window !== 'undefined' && window.FocusTubePlayer) {
      window.FocusTubePlayer.pause();
    }

    this.persistTimerState();
    this.render();
    console.log(`[Timer] Paused (${this.mode} block ${this.currentBlock})`);
  },

  /**
   * Resets the current block's timer back to 00:00 elapsed (full duration remaining).
   */
  reset() {
    this.pause();
    this.elapsedBeforePauseMs = 0;
    this.startTime = null;
    if (this.elements.breakContainer) {
      this.elements.breakContainer.style.display = 'none';
    }
    this.render();
    console.log(`[Timer] Reset (${this.mode} block ${this.currentBlock})`);
  },

  /**
   * High-frequency tick called every 250ms.
   * Checks remaining time using Date.now() timestamp math.
   */
  tick() {
    const remaining = this.getRemainingMs();

    if (remaining <= 0) {
      this.handleBlockCompleted();
    } else {
      this.render();
    }
  },

  /**
   * Handles transition when a block finishes.
   */
  handleBlockCompleted() {
    if (this.mode === 'focus') {
      // Focus block completed!
      this.totalFocusElapsedMs += this.FOCUS_DURATION_MS;

      // Pause video immediately
      if (typeof window !== 'undefined' && window.FocusTubePlayer) {
        window.FocusTubePlayer.pause();
      }

      // Stop running and switch mode to break
      this.isRunning = false;
      this.startTime = null;
      this.elapsedBeforePauseMs = 0;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      this.mode = 'break';

      // Show "Time for a break" state
      this.showBreakState();
      this.render();
    } else {
      // Break block completed!
      this.isRunning = false;
      this.startTime = null;
      this.elapsedBeforePauseMs = 0;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      // Advance block
      if (this.currentBlock < this.TOTAL_BLOCKS) {
        this.currentBlock++;
        this.mode = 'focus';
        this.hideBreakState();
        this.render();
      } else {
        // All 4 blocks completed
        this.mode = 'completed';
        this.renderSessionCompleted();
      }
    }
  },

  showBreakState() {
    if (this.elements.breakContainer) {
      if (this.elements.breakText) {
        this.elements.breakText.textContent = `Focus block ${this.currentBlock} of ${this.TOTAL_BLOCKS} completed! Video paused automatically. Grab some water, stretch, and recharge.`;
      }
      this.elements.breakContainer.style.display = 'flex';
    }
  },

  hideBreakState() {
    if (this.elements.breakContainer) {
      this.elements.breakContainer.style.display = 'none';
    }
  },

  skipBreak() {
    this.pause();
    this.elapsedBeforePauseMs = 0;
    this.hideBreakState();

    if (this.currentBlock < this.TOTAL_BLOCKS) {
      this.currentBlock++;
      this.mode = 'focus';
    } else {
      this.currentBlock = 1;
      this.mode = 'focus';
    }
    this.render();
  },

  renderSessionCompleted() {
    if (this.elements.blockLabel) {
      this.elements.blockLabel.textContent = `All 4 Blocks Completed! 🎉`;
    }
    if (this.elements.modeTag) {
      this.elements.modeTag.textContent = 'Complete';
      this.elements.modeTag.style.color = 'var(--color-secondary)';
    }
    if (this.elements.display) {
      this.elements.display.textContent = '00:00';
    }
    if (this.elements.sublabel) {
      this.elements.sublabel.textContent = 'Session Finished';
    }
    if (this.elements.toggleBtn) {
      this.elements.toggleBtn.innerHTML = `
        <span class="material-symbols-outlined">emoji_events</span>
        <span>View Summary</span>
      `;
      this.elements.toggleBtn.onclick = () => {
        window.location.href = 'summary.html';
      };
    }
  },

  /**
   * Updates all DOM elements according to current state.
   */
  render() {
    if (typeof document === 'undefined' || !this.elements) return;
    if (this.mode === 'completed') return;

    const remainingMs = this.getRemainingMs();
    const durationMs = this.getDurationMs();
    const elapsedMs = this.getCurrentElapsedMs();

    // 1. Calculate MM:SS formatted text
    const totalRemainingSec = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalRemainingSec / 60);
    const seconds = totalRemainingSec % 60;
    const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (this.elements.display) {
      this.elements.display.textContent = formattedTime;
    }

    // 2. Circular SVG Progress Ring Math
    const fraction = Math.min(1, Math.max(0, elapsedMs / durationMs));
    const dashoffset = this.RING_CIRCUMFERENCE * fraction;

    if (this.elements.progressCircle) {
      this.elements.progressCircle.style.strokeDashoffset = String(dashoffset);

      if (this.mode === 'break') {
        this.elements.progressCircle.style.stroke = 'var(--color-secondary)';
      } else if (!this.isRunning && elapsedMs > 0) {
        this.elements.progressCircle.style.stroke = 'var(--color-tertiary)';
      } else {
        this.elements.progressCircle.style.stroke = 'var(--color-primary)';
      }
    }

    // 3. Header labels
    if (this.elements.blockLabel) {
      if (this.mode === 'focus') {
        this.elements.blockLabel.textContent = `Focus block ${this.currentBlock} of ${this.TOTAL_BLOCKS}`;
      } else {
        this.elements.blockLabel.textContent = `Break ${this.currentBlock} of ${this.TOTAL_BLOCKS}`;
      }
    }

    if (this.elements.modeTag) {
      if (this.isDemoMode) {
        this.elements.modeTag.textContent = this.mode === 'focus' 
          ? (this.isRunning ? 'DEMO (1m block)' : (elapsedMs > 0 ? 'DEMO Paused' : 'DEMO (1m block)'))
          : 'DEMO (15s break)';
        this.elements.modeTag.style.color = 'var(--color-tertiary)';
      } else if (this.mode === 'focus') {
        this.elements.modeTag.textContent = this.isRunning ? 'Deep Work' : (elapsedMs > 0 ? 'Paused' : 'Standby');
        this.elements.modeTag.style.color = this.isRunning ? 'var(--color-primary)' : 'var(--color-tertiary)';
      } else {
        this.elements.modeTag.textContent = 'Rest & Recharge';
        this.elements.modeTag.style.color = 'var(--color-secondary)';
      }
    }

    if (this.elements.sublabel) {
      this.elements.sublabel.textContent = this.mode === 'focus' ? 'Remaining' : 'Break time';
    }

    // 4. Action button text & icons
    if (this.elements.toggleBtn) {
      if (this.isRunning) {
        if (this.elements.toggleIcon) this.elements.toggleIcon.textContent = 'pause';
        if (this.elements.toggleText) this.elements.toggleText.textContent = 'Pause';
      } else {
        if (this.elements.toggleIcon) this.elements.toggleIcon.textContent = 'play_arrow';
        if (this.elements.toggleText) {
          if (elapsedMs === 0) {
            this.elements.toggleText.textContent = this.mode === 'focus' ? 'Start session' : 'Start break';
          } else {
            this.elements.toggleText.textContent = 'Resume';
          }
        }
      }
    }

    // Reset button state
    if (this.elements.resetBtn) {
      this.elements.resetBtn.disabled = (elapsedMs === 0 && !this.isRunning);
    }
  }
};

// Guard environments for modular usage in browser and unit testing in Node
if (typeof window !== 'undefined') {
  window.FocusTubeTimer = FocusTubeTimer;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubeTimer.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FocusTubeTimer };
}
