/**
 * FocusTube - Video Player Module
 * Integrates YouTube IFrame API (youtube-nocookie.com), manages playback,
 * custom controls dock (play/pause, rewind 10s, forward 10s, scrubber, speed, fullscreen),
 * live time synchronization, and handles playback errors.
 */

const FocusTubePlayer = {
  currentVideo: null,
  youtubeVideoId: null,
  ytPlayer: null,
  isReady: false,
  readyWatchdog: null,
  progressTicker: null,
  playbackRate: 1.0,
  isScrubbing: false,
  controlsBound: false,

  init() {
    const isDemo = typeof window !== 'undefined' && window.location && (new URLSearchParams(window.location.search).get('demo') === '1' || window.location.search.includes('demo=1'));

    // Edge case: no saved videoId (show empty state instead of broken playback)
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      if (!window.FocusTubeStorage.hasSavedVideo() && !isDemo) {
        const emptyStateEl = document.getElementById('study-empty-state');
        const workspaceEl = document.getElementById('study-main-workspace');
        if (emptyStateEl && workspaceEl) {
          emptyStateEl.style.display = 'block';
          workspaceEl.style.display = 'none';
          const sessionH1 = document.querySelector('.session-title-group h1');
          if (sessionH1) sessionH1.textContent = 'No Video Selected';
          console.warn('[Player] No saved videoId found in localStorage. Displaying empty state.');
          return;
        }
      }
    }

    if (typeof window !== 'undefined' && window.FocusTubeStorage && window.FocusTubeStorage.hasQueue()) {
      const queue = window.FocusTubeStorage.getQueue();
      const currentIdx = window.FocusTubeStorage.getCurrentQueueIndex();
      if (queue && queue[currentIdx]) {
        this.currentVideo = queue[currentIdx];
      } else {
        this.currentVideo = (window.FocusTubeStorage && window.FocusTubeStorage.getCurrentVideo()) || {
          videoId: 'mit-1806-l01',
          title: 'MIT 18.06 Linear Algebra - Lecture 1: The Geometry of Linear Equations',
          custom: false
        };
      }
    } else {
      this.currentVideo = (window.FocusTubeStorage && window.FocusTubeStorage.getCurrentVideo()) || {
        videoId: 'mit-1806-l01',
        title: 'MIT 18.06 Linear Algebra - Lecture 1: The Geometry of Linear Equations',
        custom: false
      };
    }

    console.log('[Player] Active Study Session Video:', this.currentVideo);

    this.bindCustomControls();
    this.bindKeyboardShortcuts();
    this.initQueue();
    this.setupQuizPrefetch();
    this.resolveVideoMetadata();
    this.initYouTubeAPI();
  },

  async resolveVideoMetadata() {
    const video = this.currentVideo;

    // If custom video or queue video, the videoId is already the 11-char YouTube ID
    if (video.custom || /^[a-zA-Z0-9_-]{11}$/.test(video.videoId)) {
      this.youtubeVideoId = video.videoId;
      this.updateDOMTitles(video.title || `Custom Lecture (${video.videoId})`, video.channel || video.author || 'YouTube');
      this.renderChapters(video.chapters || null);
      return;
    }

    // Otherwise, look up demo videos from data/videos.json
    try {
      const res = await fetch('data/videos.json');
      if (res.ok) {
        const videos = await res.json();
        const matched = videos.find(v => v.id === video.videoId);
        if (matched) {
          this.youtubeVideoId = matched.youtubeId || matched.id;
          this.updateDOMTitles(matched.title, matched.channel);
          this.renderChapters(matched.chapters || null);
          return;
        }
      }
    } catch (e) {
      console.warn('[Player] Error loading videos.json metadata:', e);
    }

    // Default fallback
    this.youtubeVideoId = 'J7DzL2_Na80';
    this.updateDOMTitles('MIT 18.06 Linear Algebra - Lecture 1', 'MIT OpenCourseWare');
    this.renderChapters(null);
  },

  renderChapters(chapters) {
    if (typeof document === 'undefined') return;
    const card = document.getElementById('curriculum-chapters-card');
    const list = document.getElementById('curriculum-chapters-list');
    if (!card || !list) return;

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      card.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    chapters.forEach(ch => {
      const item = document.createElement('div');
      item.style.background = 'var(--color-surface-container-lowest)';
      item.style.padding = '12px';
      item.style.borderRadius = 'var(--radius-xl)';
      item.style.cursor = 'pointer';
      item.style.transition = 'all 0.15s ease';
      item.style.border = '1px solid rgba(70, 69, 84, 0.2)';

      const m = Math.floor((ch.time || 0) / 60);
      const s = Math.floor((ch.time || 0) % 60);
      const timeFmt = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      item.innerHTML = `
        <span class="font-mono" style="font-size: var(--text-label-sm); color: var(--color-primary); font-weight: 600;">${timeFmt}</span>
        <div style="font-weight: 600; margin-top: 4px; font-size: var(--text-body-md); color: var(--color-on-surface);">${ch.title}</div>
      `;

      item.addEventListener('mouseenter', () => {
        item.style.borderColor = 'var(--color-primary)';
        item.style.transform = 'translateY(-1px)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.borderColor = 'rgba(70, 69, 84, 0.2)';
        item.style.transform = 'none';
      });
      item.addEventListener('click', () => {
        this.seekTo(ch.time || 0, true);
        this.play();
      });

      list.appendChild(item);
    });
  },

  updateDOMTitles(title, author) {
    const sessionH1 = document.querySelector('.session-title-group h1');
    if (sessionH1) sessionH1.textContent = title;

    const metaTitle = document.getElementById('lecture-meta-title') || document.querySelector('.lecture-meta-pill span:last-child');
    if (metaTitle) metaTitle.textContent = title;

    const channelBadge = document.getElementById('lecture-meta-channel') || document.querySelector('.lecture-meta-pill span:first-child');
    if (channelBadge && author) channelBadge.textContent = author;
  },

  initYouTubeAPI() {
    // If YouTube IFrame API script is not yet in the document, inject it
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // Hook API ready callback
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      this.createPlayer();
    };

    if (window.YT && window.YT.Player) {
      this.createPlayer();
    }
  },

  createPlayer() {
    const playerTarget = document.getElementById('youtube-player-iframe');
    if (!playerTarget || !this.youtubeVideoId) return;

    try {
      this.ytPlayer = new window.YT.Player('youtube-player-iframe', {
        host: 'https://www.youtube-nocookie.com',
        videoId: this.youtubeVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0, // Clean custom player dock
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (e) => this.onPlayerReady(e),
          onStateChange: (e) => this.onStateChange(e),
          onError: (e) => this.onError(e)
        }
      });

      // Watchdog: If player does not become ready within 10 seconds, show friendly fallback error
      if (this.readyWatchdog) clearTimeout(this.readyWatchdog);
      this.readyWatchdog = setTimeout(() => {
        if (!this.isReady) {
          console.warn('[Player] Watchdog timeout: YouTube player failed to load within 10s');
          this.showErrorOverlay("This video took too long to load or failed to initialize. It may be restricted or unavailable.");
        }
      }, 10000);
    } catch (err) {
      console.error('[Player] Error creating YT.Player:', err);
      this.showErrorOverlay("Unable to initialize video player. Check your internet connection.");
    }
  },

  onPlayerReady(event) {
    this.isReady = true;
    if (this.readyWatchdog) {
      clearTimeout(this.readyWatchdog);
      this.readyWatchdog = null;
    }
    console.log('[Player] YouTube Player Ready (nocookie embed)');
    this.bindCustomControls();
    this.startProgressTicker();
    this.updateProgressUI();
  },

  onStateChange(event) {
    const state = event.data;
    // YT.PlayerState: PLAYING = 1, PAUSED = 2, ENDED = 0, BUFFERING = 3, CUED = 5
    if (window.YT) {
      if (state === window.YT.PlayerState.PLAYING) {
        this.updatePlayPauseIcon(true);
        // If timer is not running and in focus mode, sync start/resume
        if (window.FocusTubeTimer && !window.FocusTubeTimer.isRunning) {
          window.FocusTubeTimer.resume();
        }
      } else if (state === window.YT.PlayerState.PAUSED) {
        this.updatePlayPauseIcon(false);
        // If timer is running, pause timer
        if (window.FocusTubeTimer && window.FocusTubeTimer.isRunning) {
          window.FocusTubeTimer.pause();
        }
      } else if (state === window.YT.PlayerState.ENDED) {
        this.handleVideoEnded();
      }
    }
    this.updateProgressUI();
  },

  // -------------------------------------------------------------
  // Study Queue & Lecture Transitions
  // -------------------------------------------------------------
  initQueue() {
    if (typeof window === 'undefined' || !window.FocusTubeStorage) return;

    const queue = window.FocusTubeStorage.getQueue();
    const queuePanel = document.getElementById('study-queue-panel');

    if (!queue || queue.length <= 1) {
      if (queuePanel) queuePanel.style.display = 'none';
      return;
    }

    if (queuePanel) queuePanel.style.display = 'block';

    this.renderQueueList();
    this.bindQueueOverlayActions();
  },

  renderQueueList() {
    const queue = window.FocusTubeStorage.getQueue();
    const queueList = document.getElementById('study-queue-list');
    const queueBadge = document.getElementById('queue-progress-badge');
    const currentIdx = window.FocusTubeStorage.getCurrentQueueIndex();

    if (!queueList) return;

    if (queueBadge) {
      queueBadge.textContent = `${currentIdx + 1} / ${queue.length}`;
    }

    queueList.innerHTML = '';
    queue.forEach((item, index) => {
      const row = document.createElement('div');
      const isActive = index === currentIdx;
      row.className = `queue-item ${isActive ? 'active' : ''}`;
      row.setAttribute('data-queue-index', index);
      row.setAttribute('data-video-id', item.videoId);

      const thumbUrl = item.thumbnail || `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`;
      const positionNumber = (index + 1).toString().padStart(2, '0');

      row.innerHTML = `
        <span class="queue-item-index font-mono">${positionNumber}</span>
        <div class="queue-item-thumb">
          <img src="${thumbUrl}" alt="Thumbnail" loading="lazy" />
        </div>
        <div class="queue-item-info">
          <div class="queue-item-title">${item.title}</div>
          <div class="queue-item-channel">${item.channel || item.author || 'Lecture'}</div>
        </div>
        <div class="queue-item-status-badge font-mono">
          ${isActive ? 'CURRENT' : (index < currentIdx ? 'DONE' : 'NEXT')}
        </div>
      `;

      row.addEventListener('click', () => {
        this.loadQueueVideo(item, index, true);
      });

      queueList.appendChild(row);
    });
  },

  bindQueueOverlayActions() {
    const playNextBtn = document.getElementById('next-queue-play-btn');
    const replayBtn = document.getElementById('next-queue-replay-btn');

    if (playNextBtn && !playNextBtn.dataset.bound) {
      playNextBtn.dataset.bound = 'true';
      playNextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window !== 'undefined' && window.FocusTubeStorage) {
          const nextInfo = window.FocusTubeStorage.getNextQueueItem();
          if (nextInfo) {
            this.loadQueueVideo(nextInfo.item, nextInfo.nextIndex, true);
          } else {
            this.hideNextQueueOverlay();
          }
        }
      });
    }

    if (replayBtn && !replayBtn.dataset.bound) {
      replayBtn.dataset.bound = 'true';
      replayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideNextQueueOverlay();
        this.seekTo(0);
        this.play();
      });
    }
  },

  handleVideoEnded() {
    console.log('[Player] Video playback ended');
    this.updatePlayPauseIcon(false);

    // Never autoplay next video. Check queue.
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      const nextInfo = window.FocusTubeStorage.getNextQueueItem();
      if (nextInfo && nextInfo.item) {
        this.showNextQueueOverlay(nextInfo.item);
        // Requirement: "Keep the Pomodoro timer running across videos"
        // Timer continues running across videos!
        return;
      }
    }

    // If standalone video or last video in queue finished:
    if (window.FocusTubeTimer && window.FocusTubeTimer.isRunning) {
      window.FocusTubeTimer.pause();
    }
  },

  showNextQueueOverlay(nextItem) {
    const overlay = document.getElementById('next-queue-overlay');
    if (!overlay) return;

    const thumb = document.getElementById('next-queue-thumb');
    const title = document.getElementById('next-queue-title');
    const channel = document.getElementById('next-queue-channel');

    if (thumb) {
      thumb.src = nextItem.thumbnail || `https://img.youtube.com/vi/${nextItem.videoId}/mqdefault.jpg`;
    }
    if (title) {
      title.textContent = nextItem.title || 'Next Lecture';
    }
    if (channel) {
      channel.textContent = nextItem.channel || nextItem.author || 'Next in Study Queue';
    }

    overlay.style.display = 'flex';
  },

  hideNextQueueOverlay() {
    const overlay = document.getElementById('next-queue-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  },

  loadQueueVideo(item, index, autoPlay = false) {
    this.hideNextQueueOverlay();
    if (!item || !item.videoId) return;

    console.log(`[Player] Loading queue video index ${index}:`, item);

    this.currentVideo = item;
    this.youtubeVideoId = item.videoId;

    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      window.FocusTubeStorage.setCurrentVideo(item);
      window.FocusTubeStorage.setCurrentQueueIndex(index);
    }

    // Keep session videoId updated in FocusTubeTracker if active
    if (typeof window !== 'undefined' && window.FocusTubeTracker && window.FocusTubeTracker.session) {
      window.FocusTubeTracker.session.videoId = item.videoId;
    }

    this.updateDOMTitles(item.title, item.channel || item.author || 'Study Queue');
    this.renderQueueList();
    this.setupQuizPrefetch();

    if (this.ytPlayer) {
      try {
        if (autoPlay) {
          if (typeof this.ytPlayer.loadVideoById === 'function') {
            this.ytPlayer.loadVideoById({ videoId: item.videoId });
            this.updatePlayPauseIcon(true);
          }
        } else {
          if (typeof this.ytPlayer.cueVideoById === 'function') {
            this.ytPlayer.cueVideoById({ videoId: item.videoId });
          }
        }
      } catch (err) {
        console.warn('[Player] Error loading video in player:', err);
      }
    }
  },

  setupQuizPrefetch() {
    if (typeof window === 'undefined' || !window.FocusTubeStorage) return;

    const videoId = (this.currentVideo && this.currentVideo.videoId) || 'mit-1806-l01';
    const pill = document.getElementById('quiz-status-indicator');
    const pillIcon = document.getElementById('quiz-status-icon');
    const pillText = document.getElementById('quiz-status-text');

    const updateUI = (status) => {
      if (!pill) return;
      if (status === 'preparing') {
        pill.style.display = 'inline-flex';
        pill.style.background = 'rgba(99, 102, 241, 0.15)';
        pill.style.color = 'var(--color-primary)';
        if (pillIcon) {
          pillIcon.textContent = 'sync';
          pillIcon.style.animation = 'spin 1.5s linear infinite';
        }
        if (pillText) pillText.textContent = 'Quiz preparing…';
      } else if (status === 'ready') {
        pill.style.display = 'inline-flex';
        pill.style.background = 'rgba(74, 225, 118, 0.15)';
        pill.style.color = 'var(--color-secondary)';
        if (pillIcon) {
          pillIcon.textContent = 'psychology';
          pillIcon.style.animation = 'none';
        }
        if (pillText) pillText.textContent = '✓ Quiz ready';
      } else if (status === 'error') {
        pill.style.display = 'inline-flex';
        pill.style.background = 'rgba(255, 185, 95, 0.15)';
        pill.style.color = 'var(--color-tertiary)';
        if (pillIcon) {
          pillIcon.textContent = 'warning';
          pillIcon.style.animation = 'none';
        }
        if (pillText) pillText.textContent = 'Quiz offline';
      } else {
        pill.style.display = 'none';
      }
    };

    const currentStatus = window.FocusTubeStorage.getQuizStatus(videoId);
    updateUI(currentStatus || 'preparing');

    // Trigger prefetch in background
    window.FocusTubeStorage.prefetchQuiz(videoId, this.currentVideo).then(questions => {
      if (questions && questions.length > 0) {
        updateUI('ready');
      } else {
        updateUI('error');
      }
    });

    if (!this._quizStatusBound) {
      this._quizStatusBound = true;
      window.addEventListener('focustube:quiz-status', (e) => {
        if (e.detail && e.detail.videoId === (this.currentVideo && this.currentVideo.videoId)) {
          updateUI(e.detail.status);
        }
      });
      window.addEventListener('focustube:quiz-ready', (e) => {
        if (e.detail && e.detail.videoId === (this.currentVideo && this.currentVideo.videoId)) {
          updateUI('ready');
        }
      });
    }
  },

  play() {
    if (this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
      try {
        this.ytPlayer.playVideo();
        this.updatePlayPauseIcon(true);
      } catch (e) {
        console.warn('[Player] Error in playVideo():', e);
      }
    }
  },

  pause() {
    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try {
        this.ytPlayer.pauseVideo();
        this.updatePlayPauseIcon(false);
      } catch (e) {
        console.warn('[Player] Error in pauseVideo():', e);
      }
    }
  },

  togglePlayPause() {
    if (this.isPlaying()) {
      this.pause();
      if (window.FocusTubeTimer && window.FocusTubeTimer.isRunning) {
        window.FocusTubeTimer.pause();
      }
    } else {
      this.play();
      if (window.FocusTubeTimer && !window.FocusTubeTimer.isRunning) {
        window.FocusTubeTimer.resume();
      }
    }
  },

  rewind(seconds = 10) {
    const current = this.getCurrentTime();
    this.seekTo(Math.max(0, current - seconds));
  },

  forward(seconds = 10) {
    const current = this.getCurrentTime();
    const duration = this.getDuration() || (current + seconds);
    this.seekTo(Math.min(duration, current + seconds));
  },

  seekTo(seconds, allowSeekAhead = true) {
    if (this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      try {
        this.ytPlayer.seekTo(seconds, allowSeekAhead);
      } catch (e) {
        console.warn('[Player] Error in seekTo():', e);
      }
    }
    this.updateProgressUI(seconds);
  },

  isPlaying() {
    if (!this.ytPlayer || typeof this.ytPlayer.getPlayerState !== 'function') return false;
    return this.ytPlayer.getPlayerState() === 1;
  },

  getCurrentTime() {
    if (!this.ytPlayer || typeof this.ytPlayer.getCurrentTime !== 'function') return 0;
    try {
      return this.ytPlayer.getCurrentTime() || 0;
    } catch (e) {
      return 0;
    }
  },

  getDuration() {
    if (!this.ytPlayer || typeof this.ytPlayer.getDuration !== 'function') return 0;
    try {
      return this.ytPlayer.getDuration() || 0;
    } catch (e) {
      return 0;
    }
  },

  cyclePlaybackSpeed() {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    let currentRate = 1.0;
    if (this.ytPlayer && typeof this.ytPlayer.getPlaybackRate === 'function') {
      try {
        currentRate = this.ytPlayer.getPlaybackRate() || this.playbackRate;
      } catch (e) {}
    }
    const idx = speeds.indexOf(currentRate);
    const nextRate = speeds[(idx + 1) % speeds.length];
    this.playbackRate = nextRate;

    if (this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === 'function') {
      try {
        this.ytPlayer.setPlaybackRate(nextRate);
      } catch (e) {}
    }

    const speedBtn = document.getElementById('player-speed-btn');
    if (speedBtn) {
      speedBtn.textContent = `${nextRate}x`;
    }
  },

  toggleFullscreen() {
    const playerFrame = document.querySelector('.player-frame');
    if (!playerFrame) return;

    if (!document.fullscreenElement) {
      if (playerFrame.requestFullscreen) {
        playerFrame.requestFullscreen().catch(() => {});
      } else if (playerFrame.webkitRequestFullscreen) {
        playerFrame.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  },

  formatTime(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const total = Math.floor(totalSeconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  },

  startProgressTicker() {
    if (this.progressTicker) clearInterval(this.progressTicker);
    this.progressTicker = setInterval(() => {
      if (!this.isScrubbing) {
        this.updateProgressUI();
      }
    }, 250);
  },

  updateProgressUI(overrideCurrent = null, overrideDuration = null) {
    const currentTime = overrideCurrent !== null ? overrideCurrent : this.getCurrentTime();
    const duration = overrideDuration !== null ? overrideDuration : this.getDuration();

    const timeDisplay = document.getElementById('player-current-time-display');
    const durationDisplay = document.getElementById('player-duration-display');
    const progressBar = document.getElementById('player-timeline-progress');

    if (timeDisplay) {
      timeDisplay.textContent = this.formatTime(currentTime);
    }

    if (durationDisplay) {
      if (duration > 0) {
        durationDisplay.textContent = `/ ${this.formatTime(duration)}`;
      } else {
        durationDisplay.textContent = '/ --:--';
      }
    }

    if (progressBar && duration > 0) {
      const pct = Math.max(0, Math.min(100, (currentTime / duration) * 100));
      progressBar.style.width = `${pct}%`;
    }

    this.updatePlayPauseIcon(this.isPlaying());
  },

  updatePlayPauseIcon(isPlaying) {
    const playPauseIcon = document.getElementById('player-play-pause-icon');
    if (playPauseIcon) {
      playPauseIcon.textContent = isPlaying ? 'pause' : 'play_arrow';
    }
    const playPauseBtn = document.getElementById('player-play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.setAttribute('title', isPlaying ? 'Pause Video (Space)' : 'Play Video (Space)');
    }
  },

  bindCustomControls() {
    if (this.controlsBound) return;
    this.controlsBound = true;

    // Play/Pause button
    const playPauseBtn = document.getElementById('player-play-pause-btn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.togglePlayPause();
      });
    }

    // Rewind 10s button
    const rewindBtn = document.getElementById('player-rewind-btn');
    if (rewindBtn) {
      rewindBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.rewind(10);
      });
    }

    // Forward 10s button
    const forwardBtn = document.getElementById('player-forward-btn');
    if (forwardBtn) {
      forwardBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.forward(10);
      });
    }

    // Speed button
    const speedBtn = document.getElementById('player-speed-btn');
    if (speedBtn) {
      speedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.cyclePlaybackSpeed();
      });
    }

    // Fullscreen button
    const fullscreenBtn = document.getElementById('player-fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleFullscreen();
      });
    }

    // Timeline bar click and drag scrubber
    const timelineBar = document.getElementById('player-timeline-bar');
    if (timelineBar) {
      const seekFromEvent = (e) => {
        const rect = timelineBar.getBoundingClientRect();
        if (rect.width <= 0) return;
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const duration = this.getDuration();
        if (duration > 0) {
          const targetSec = pct * duration;
          this.seekTo(targetSec);
        }
      };

      timelineBar.addEventListener('click', (e) => {
        seekFromEvent(e);
      });

      timelineBar.addEventListener('mousedown', (e) => {
        this.isScrubbing = true;
        seekFromEvent(e);

        const onMouseMove = (moveEvent) => {
          seekFromEvent(moveEvent);
        };

        const onMouseUp = () => {
          this.isScrubbing = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
  },

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.rewind(10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.forward(10);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.toggleFullscreen();
      }
    });
  },

  onError(event) {
    if (this.readyWatchdog) {
      clearTimeout(this.readyWatchdog);
      this.readyWatchdog = null;
    }
    const code = event && event.data !== undefined ? event.data : event;
    console.error('[Player] YouTube Player Error fired:', code);

    let friendlyMessage = "This video can't be played in FocusTube. The owner has disabled embedding or the video is unavailable.";

    if (code === 100) {
      friendlyMessage = "The requested video was not found. It may have been removed, deleted, or marked as private.";
    } else if (code === 101 || code === 150) {
      friendlyMessage = "The owner of this video does not allow it to be played in embedded players outside of YouTube.";
    } else if (code === 2) {
      friendlyMessage = "The YouTube video ID is invalid or malformed.";
    }

    this.showErrorOverlay(friendlyMessage);
  },

  showErrorOverlay(message) {
    let overlay = document.getElementById('player-error-overlay');
    if (!overlay) {
      const playerFrame = document.querySelector('.player-frame');
      if (!playerFrame) return;

      overlay = document.createElement('div');
      overlay.id = 'player-error-overlay';
      overlay.className = 'player-error-overlay';
      playerFrame.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="player-error-card">
        <div class="error-icon-circle">
          <span class="material-symbols-outlined" style="font-size: 36px; color: var(--color-error);">error_outline</span>
        </div>
        <h3 style="font-size: var(--text-headline-sm); font-weight: 600; color: var(--color-on-surface);">Video Playback Restricted</h3>
        <p id="player-error-message" style="font-size: var(--text-body-md); color: var(--color-on-surface-variant); max-width: 380px; margin: 0 auto; line-height: 1.5;">
          ${message}
        </p>
        <div style="margin-top: var(--space-xs);">
          <a href="index.html#video-picker" class="btn btn-primary" id="choose-another-video-btn">
            <span class="material-symbols-outlined">arrow_back</span>
            <span>Choose another video</span>
          </a>
        </div>
      </div>
    `;

    overlay.style.display = 'flex';
  }
};

if (typeof window !== 'undefined') {
  window.FocusTubePlayer = FocusTubePlayer;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubePlayer.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FocusTubePlayer };
}
