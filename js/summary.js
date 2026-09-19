/**
 * FocusTube - Session Summary & In-Page Replay Module
 * Computes precision focus score, renders 4 stat cards,
 * manages distraction review list & empty state,
 * and provides embedded in-page YouTube replay seeking to 5s prior to distraction.
 */

const FocusTubeSummary = {
  currentVideo: null,
  currentSession: null,
  ytPlayer: null,
  isPlayerReady: false,
  pendingSeekTime: 0,

  init() {
    this.loadData();
    if (!this.currentSession) {
      this.renderEmptyState();
      return;
    }
    this.bindEvents();
    this.renderSessionMetadata();
    this.renderMetricsAndScore();
    this.renderDistractionList();
    this.setupActiveRecallQuiz();
    this.initYouTubeAPI();
    console.log('[Summary] FocusTube Session Summary Initialized');
  },

  renderEmptyState() {
    if (typeof document === 'undefined') return;
    const emptyStateEl = document.getElementById('summary-empty-state');
    const dashboardEl = document.getElementById('summary-dashboard');
    if (emptyStateEl) emptyStateEl.style.display = 'block';
    if (dashboardEl) dashboardEl.style.display = 'none';
  },

  loadData() {
    // 1. Current Session (PRD Data Model)
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      this.currentSession = window.FocusTubeStorage.getCurrentSession();
    }

    // 2. Current Video
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      this.currentVideo = window.FocusTubeStorage.getCurrentVideo();
    }
    if (!this.currentVideo && this.currentSession) {
      this.currentVideo = {
        videoId: this.currentSession.videoId || 'mit-1806-l01',
        title: 'Study Session',
        author: 'FocusTube',
        custom: true
      };
    }
  },

  bindEvents() {
    if (typeof document === 'undefined') return;

    // Start new session buttons
    const startNewBtns = [
      document.getElementById('summary-start-new-btn'),
      document.getElementById('header-start-new-btn')
    ];
    startNewBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => this.startNewSession());
      }
    });

    // Export session notes button
    const exportBtn = document.getElementById('export-notes-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportSessionNotes());
    }

    // Replay Modal Close buttons
    const closeBtn = document.getElementById('replay-modal-close');
    const doneBtn = document.getElementById('replay-modal-done-btn');
    const modal = document.getElementById('replay-player-modal');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeReplayModal());
    if (doneBtn) doneBtn.addEventListener('click', () => this.closeReplayModal());

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeReplayModal();
        }
      });
    }

    // Take recall quiz button
    const takeQuizBtn = document.getElementById('take-quiz-action-btn');
    if (takeQuizBtn) {
      takeQuizBtn.addEventListener('click', () => {
        window.location.href = 'quiz.html';
      });
    }

    // Keyboard ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeReplayModal();
      }
    });
  },

  startNewSession() {
    // Clear completed session from storage so next study session starts fresh
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('focustube_current_session');
    }
    window.location.href = 'study.html';
  },

  exportSessionNotes() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const session = this.currentSession;
    if (!session) return;
    const video = this.currentVideo || { title: 'Study Session', videoId: session.videoId || 'unknown' };

    let totalTime = session.totalStudyTimeSec;
    if (!totalTime || totalTime <= 0) {
      totalTime = (session.pomodoro ? session.pomodoro.studyMin : 25) * 60;
    }

    const distractions = session.distractions || [];
    const timeAway = distractions.reduce((sum, d) => sum + (d.durationSec || 0), 0);
    const focusedTime = Math.max(0, totalTime - timeAway);
    const focusScore = totalTime > 0
      ? Math.max(0, Math.min(100, Math.round(((totalTime - timeAway) / totalTime) * 100)))
      : 100;

    const lookingAwaySec = distractions.filter(d => d.type === 'face_away').reduce((sum, d) => sum + (d.durationSec || 0), 0);
    const awayTabSec = distractions.filter(d => d.type === 'tab_hidden' || d.type === 'window_blur').reduce((sum, d) => sum + (d.durationSec || 0), 0);

    const dateStr = session.startTime ? new Date(session.startTime).toLocaleString() : new Date().toLocaleString();

    let distractionMarkdown = '';
    if (distractions.length === 0) {
      distractionMarkdown = 'No attention lapses were recorded during this session.\n';
    } else {
      distractionMarkdown = distractions.map((d, i) => {
        const time = this.formatTime(d.videoTime || 0);
        const dur = this.formatDuration(d.durationSec || 0);
        let typeName = 'Looked away';
        if (d.type === 'tab_hidden') typeName = 'Switched tab';
        else if (d.type === 'window_blur') typeName = 'Window blur';
        return `${i + 1}. **${time}** - ${typeName} (Duration: ${dur})`;
      }).join('\n') + '\n';
    }

    const mdContent = `# FocusTube Study Session Notes

**Topic / Video:** ${video.title || 'Study Session'}
**Video ID:** ${video.videoId || 'N/A'}
**Session Date:** ${dateStr}

## Performance Summary
- **Overall Focus Score:** ${focusScore}%
- **Total Session Time:** ${this.formatTime(totalTime)}
- **Attentive Study Time:** ${this.formatTime(focusedTime)}
- **Time Diverted:** ${this.formatTime(timeAway)}
- **Looking Away Duration:** ${this.formatTime(lookingAwaySec)}
- **Tab Switch Duration:** ${this.formatTime(awayTabSec)}
- **Total Distraction Events:** ${distractions.length}

## Attention Log
${distractionMarkdown}
---
*Exported from FocusTube. Camera frames never leave your device. Only the public video link is sent to generate your quiz.*
`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (video.title || 'study-session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    a.href = url;
    a.download = `focustube-session-${safeTitle || 'notes'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  renderSessionMetadata() {
    if (typeof document === 'undefined') return;
    const video = this.currentVideo;
    const session = this.currentSession;

    const titleEl = document.getElementById('summary-session-title');
    const subtitleEl = document.getElementById('summary-session-subtitle');
    const sessionTag = document.getElementById('summary-session-tag');

    if (titleEl) {
      titleEl.innerHTML = `Session complete <span style="font-size: 32px;">🎉</span>`;
    }

    if (subtitleEl && video.title) {
      subtitleEl.textContent = `${video.title} • Completed in 1 block`;
    }

    if (sessionTag && video.videoId) {
      sessionTag.textContent = `SESSION #${video.videoId.toUpperCase().slice(0, 12)}`;
    }
  },

  /**
   * Computes focus score using exact requirement:
   * (totalTime - timeAway) / totalTime * 100
   * Also populates the 4 stat cards.
   */
  renderMetricsAndScore() {
    if (typeof document === 'undefined') return;
    const session = this.currentSession;
    if (!session) return;

    // 1. Total Time
    let totalTime = session.totalStudyTimeSec;
    if (!totalTime || totalTime <= 0) {
      totalTime = (session.pomodoro ? session.pomodoro.studyMin : 25) * 60;
    }

    // 2. Distractions & Time Away
    const distractions = session.distractions || [];
    const timeAway = distractions.reduce((sum, d) => sum + (d.durationSec || 0), 0);
    const focusedTime = Math.max(0, totalTime - timeAway);

    // 3. Formula: (totalTime - timeAway) / totalTime * 100
    const focusScore = totalTime > 0
      ? Math.max(0, Math.min(100, Math.round(((totalTime - timeAway) / totalTime) * 100)))
      : 100;

    // 4. Partition time away: Looking away vs Away from tab
    const lookingAwayDistractions = distractions.filter(d => d.type === 'face_away');
    const lookingAwaySec = lookingAwayDistractions.reduce((sum, d) => sum + (d.durationSec || 0), 0);

    const awayTabDistractions = distractions.filter(d => d.type === 'tab_hidden' || d.type === 'window_blur');
    const awayTabSec = awayTabDistractions.reduce((sum, d) => sum + (d.durationSec || 0), 0);

    // 5. Update Hero Focus Score Card
    const scoreDisplay = document.getElementById('summary-focus-score');
    if (scoreDisplay) {
      scoreDisplay.textContent = `${focusScore}%`;
    }

    const gaugeCircle = document.getElementById('summary-gauge-circle');
    if (gaugeCircle) {
      // Circumference for r=50: 2 * Math.PI * 50 = 314.16
      const circumference = 314.16;
      const offset = circumference * (1 - (focusScore / 100));
      gaugeCircle.style.strokeDashoffset = String(offset);

      if (focusScore >= 80) {
        gaugeCircle.style.stroke = 'var(--color-secondary)'; // Emerald
      } else if (focusScore >= 60) {
        gaugeCircle.style.stroke = 'var(--color-tertiary)'; // Amber
      } else {
        gaugeCircle.style.stroke = 'var(--color-error)'; // Red
      }
    }

    const zoneTag = document.getElementById('summary-retention-zone');
    const zoneWrap = document.getElementById('summary-retention-zone-wrap');
    const tierEl = document.getElementById('summary-attentiveness-tier');
    const headlineEl = document.getElementById('summary-assessment-headline');
    const tagEl = document.getElementById('summary-assessment-tag');
    const narrativeEl = document.getElementById('summary-assessment-text');

    if (focusScore >= 80) {
      if (zoneTag) zoneTag.textContent = 'Optimal Focus Zone';
      if (tierEl) tierEl.textContent = 'Strong Attention';
      if (headlineEl) headlineEl.textContent = 'High Focus Session';
      if (tagEl) {
        tagEl.textContent = 'Great Focus';
        tagEl.style.color = 'var(--color-primary)';
      }
    } else if (focusScore >= 60) {
      if (zoneTag) zoneTag.textContent = 'Moderate Focus Zone';
      if (tierEl) tierEl.textContent = 'Moderate Attention';
      if (headlineEl) headlineEl.textContent = 'Moderate Focus Session';
      if (tagEl) {
        tagEl.textContent = 'Review Recommended';
        tagEl.style.color = 'var(--color-tertiary)';
      }
    } else {
      if (zoneTag) zoneTag.textContent = 'Attention Lapses Recorded';
      if (tierEl) tierEl.textContent = 'Frequent Lapses';
      if (headlineEl) headlineEl.textContent = 'Session Needs Review';
      if (tagEl) {
        tagEl.textContent = 'Needs Review';
        tagEl.style.color = 'var(--color-error)';
      }
    }

    if (narrativeEl) {
      if (distractions.length === 0) {
        narrativeEl.innerHTML = `You maintained uninterrupted focus for <strong style="color: var(--color-on-surface);">${focusScore}%</strong> of this block. Zero attention lapses registered!`;
      } else {
        narrativeEl.innerHTML = `You remained deeply focused for <strong style="color: var(--color-on-surface);">${focusScore}%</strong> of this block. ${distractions.length} attention lapse${distractions.length === 1 ? '' : 's'} recorded during this session.`;
      }
    }

    // 6. Update the 4 Stat Cards
    // Card 1: Study Time
    const statStudyTime = document.getElementById('stat-study-time');
    const statStudyTarget = document.getElementById('stat-study-target');
    if (statStudyTime) statStudyTime.textContent = this.formatTime(totalTime);
    if (statStudyTarget) statStudyTarget.textContent = `Target: ${Math.round(totalTime / 60)}m`;

    // Card 2: Focused Time
    const statFocusedTime = document.getElementById('stat-focused-time');
    const statFocusedSub = document.getElementById('stat-focused-sub');
    if (statFocusedTime) statFocusedTime.textContent = this.formatTime(focusedTime);
    if (statFocusedSub) {
      const pct = totalTime > 0 ? ((focusedTime / totalTime) * 100).toFixed(1) : '100.0';
      statFocusedSub.textContent = `${pct}% attentive`;
    }

    // Card 3: Looking away
    const statLookingAway = document.getElementById('stat-looking-away');
    const statLookingAwaySub = document.getElementById('stat-looking-away-sub');
    if (statLookingAway) statLookingAway.textContent = this.formatTime(lookingAwaySec);
    if (statLookingAwaySub) {
      statLookingAwaySub.textContent = `${lookingAwayDistractions.length} occurrence${lookingAwayDistractions.length === 1 ? '' : 's'}`;
    }

    // Card 4: Away from tab
    const statAwayTab = document.getElementById('stat-away-tab');
    const statAwayTabSub = document.getElementById('stat-away-tab-sub');
    if (statAwayTab) statAwayTab.textContent = this.formatTime(awayTabSec);
    if (statAwayTabSub) {
      statAwayTabSub.textContent = awayTabDistractions.length === 0 ? 'Zero tab switches' : `${awayTabDistractions.length} tab switch${awayTabDistractions.length === 1 ? '' : 'es'}`;
    }
  },

  /**
   * Renders the distraction list rows or handles empty state gracefully.
   */
  renderDistractionList() {
    if (typeof document === 'undefined') return;
    const distractions = (this.currentSession && this.currentSession.distractions) || [];

    const emptyStateEl = document.getElementById('distractions-empty-state');
    const reviewListEl = document.getElementById('distractions-review-list');

    if (!reviewListEl) return;

    // Requirement: Handle empty state gracefully
    if (distractions.length === 0) {
      if (emptyStateEl) emptyStateEl.style.display = 'block';
      reviewListEl.style.display = 'none';
      reviewListEl.innerHTML = '';
      return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';
    reviewListEl.style.display = 'flex';
    reviewListEl.innerHTML = '';

    // Render every distraction as a row
    distractions.forEach((d, index) => {
      const row = document.createElement('div');
      row.className = 'review-row';

      const timeFormatted = this.formatTime(d.videoTime || 0);
      const durFormatted = this.formatDuration(d.durationSec || 0);

      // Reason tag
      let reasonLabel = 'Away from tab';
      let tagColor = 'var(--color-tertiary)';
      let tagBg = 'rgba(255, 185, 95, 0.15)';

      if (d.type === 'tab_hidden') {
        reasonLabel = 'Left tab';
        tagColor = 'var(--color-tertiary)';
        tagBg = 'rgba(255, 185, 95, 0.15)';
      } else if (d.type === 'face_away') {
        reasonLabel = 'Looked away';
        tagColor = 'var(--color-primary)';
        tagBg = 'rgba(99, 102, 241, 0.15)';
      } else if (d.type === 'looking_down') {
        reasonLabel = 'Looked down';
        tagColor = 'var(--color-tertiary)';
        tagBg = 'rgba(255, 185, 95, 0.15)';
      } else if (d.type === 'phone_visible') {
        reasonLabel = 'Phone detected';
        tagColor = 'var(--color-error)';
        tagBg = 'rgba(255, 180, 171, 0.2)';
      } else if (d.type === 'window_blur') {
        reasonLabel = 'Window blur';
        tagColor = 'var(--color-tertiary)';
        tagBg = 'rgba(255, 185, 95, 0.15)';
      }

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-md);">
          <div class="clip-thumb">
            <span class="material-symbols-outlined" style="font-size: 28px;">play_circle</span>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: var(--space-xs); margin-bottom: 4px; flex-wrap: wrap;">
              <span class="font-mono" style="font-size: var(--text-label-sm); background: var(--color-surface-container-highest); color: var(--color-primary); padding: 2px 6px; border-radius: 4px;">${timeFormatted}</span>
              <span class="engine-tag" style="color: ${tagColor}; background: ${tagBg};">${reasonLabel}</span>
              <span style="font-size: var(--text-label-sm); color: var(--color-outline);">Duration: ${durFormatted}</span>
            </div>
            <div style="font-size: var(--text-headline-sm); font-weight: 600;">Distraction #${index + 1} at ${timeFormatted}</div>
            <div style="font-size: var(--text-body-sm); color: var(--color-on-surface-variant); margin-top: 2px;">
              Attention diverted during lecture flow. Click replay to re-watch from 5 seconds before this moment.
            </div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm replay-moment-btn" data-video-time="${d.videoTime}" type="button">
          <span class="material-symbols-outlined" style="font-size: 16px;">play_arrow</span>
          <span>▶ Replay</span>
        </button>
      `;

      // Bind replay click
      const replayBtn = row.querySelector('.replay-moment-btn');
      if (replayBtn) {
        replayBtn.addEventListener('click', () => {
          this.openReplayModal(d.videoTime || 0, d.videoId || null);
        });
      }

      reviewListEl.appendChild(row);
    });
  },

  /**
   * Opens the in-page embedded YouTube replay modal and seeks to 5 seconds before timestamp.
   */
  async openReplayModal(videoTime, targetVideoId = null) {
    const modal = document.getElementById('replay-player-modal');
    const titleEl = document.getElementById('replay-modal-title');
    const noteEl = document.getElementById('replay-modal-note');

    const seekSeconds = Math.max(0, Math.floor(videoTime) - 5);
    this.pendingSeekTime = seekSeconds;

    if (titleEl) {
      titleEl.textContent = `Replay: Distraction at ${this.formatTime(videoTime)}`;
    }
    if (noteEl) {
      noteEl.textContent = `Playing from ${this.formatTime(seekSeconds)} (5s prior to distraction moment).`;
    }

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    // Resolve YouTube 11-char ID
    const videoId = await this.resolveYouTubeId(targetVideoId);

    // If player already created, seek and play
    if (this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
      try {
        this.ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: seekSeconds
        });
      } catch (e) {
        console.warn('[Summary Replay] Error playing video:', e);
      }
    } else {
      // Create player
      this.createReplayPlayer(videoId, seekSeconds);
    }
  },

  closeReplayModal() {
    const modal = document.getElementById('replay-player-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try {
        this.ytPlayer.pauseVideo();
      } catch (e) {
        console.warn('[Summary Replay] Error pausing video:', e);
      }
    }
  },

  async resolveYouTubeId(targetId = null) {
    if (targetId) {
      if (/^[a-zA-Z0-9_-]{11}$/.test(targetId)) return targetId;
      try {
        const res = await fetch('data/videos.json');
        if (res.ok) {
          const list = await res.json();
          const matched = list.find(v => v.id === targetId || v.youtubeId === targetId);
          if (matched) return matched.youtubeId || matched.id;
        }
      } catch (e) {}
      return targetId;
    }

    const video = this.currentVideo;
    if (video.custom || /^[a-zA-Z0-9_-]{11}$/.test(video.videoId)) {
      return video.videoId;
    }

    // Lookup in data/videos.json
    try {
      const res = await fetch('data/videos.json');
      if (res.ok) {
        const list = await res.json();
        const matched = list.find(v => v.id === video.videoId);
        if (matched) return matched.youtubeId || matched.id;
      }
    } catch (e) {
      console.warn('[Summary Replay] videos.json fetch error:', e);
    }

    return 'J7DzL2_Na80'; // default fallback
  },

  initYouTubeAPI() {
    if (typeof document === 'undefined') return;
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  },

  createReplayPlayer(youtubeId, startSeconds) {
    if (typeof window === 'undefined' || !window.YT || !window.YT.Player) {
      // Wait for YT ready
      window.onYouTubeIframeAPIReady = () => {
        this.createReplayPlayer(youtubeId, startSeconds);
      };
      return;
    }

    try {
      this.ytPlayer = new window.YT.Player('summary-replay-player', {
        videoId: youtubeId,
        playerVars: {
          autoplay: 1,
          start: startSeconds,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (e) => {
            this.isPlayerReady = true;
            try {
              e.target.seekTo(this.pendingSeekTime, true);
              e.target.playVideo();
            } catch (err) {
              console.warn('[Summary Replay] onReady playback error:', err);
            }
          }
        }
      });
    } catch (err) {
      console.error('[Summary Replay] Player creation error:', err);
    }
  },

  setupActiveRecallQuiz() {
    if (typeof document === 'undefined') return;

    const videoId = this.currentVideo ? this.currentVideo.videoId : 'mit-1806-l01';
    const card = document.getElementById('active-recall-quiz-card');
    if (!card) return;

    const iconBox = document.getElementById('quiz-card-icon-box');
    const icon = document.getElementById('quiz-card-icon');
    const title = document.getElementById('quiz-card-title');
    const subtitle = document.getElementById('quiz-card-subtitle');
    const badge = document.getElementById('quiz-card-badge');
    const takeBtn = document.getElementById('card-take-quiz-btn');
    const retryBtn = document.getElementById('quiz-retry-btn');
    const bottomTakeBtn = document.getElementById('take-quiz-action-btn');

    // Bind retry button
    if (retryBtn && !retryBtn.dataset.bound) {
      retryBtn.dataset.bound = 'true';
      retryBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        retryBtn.style.display = 'none';
        if (title) title.textContent = 'Generating active recall quiz…';
        if (subtitle) subtitle.textContent = 'Analyzing lecture moments and extracting high-yield questions.';
        if (badge) {
          badge.textContent = 'PREPARING…';
          badge.style.color = 'var(--color-primary)';
        }
        if (window.FocusTubeStorage) {
          await window.FocusTubeStorage.prefetchQuiz(videoId);
          this.setupActiveRecallQuiz();
        }
      });
    }

    // Bind bottom take quiz action button
    if (bottomTakeBtn && !bottomTakeBtn.dataset.bound) {
      bottomTakeBtn.dataset.bound = 'true';
      bottomTakeBtn.addEventListener('click', () => {
        window.location.href = 'quiz.html';
      });
    }

    // 1. Check if cached questions exist in storage
    let questions = window.FocusTubeStorage ? window.FocusTubeStorage.getQuiz(videoId) : null;
    const status = window.FocusTubeStorage ? window.FocusTubeStorage.getQuizStatus(videoId) : null;

    if (questions && Array.isArray(questions) && questions.length > 0) {
      // 2. Select questions matching distractions
      const distractions = (this.currentSession && this.currentSession.distractions) || [];
      const selected = this.selectQuestionsForDistractions(questions, distractions);

      // Cache active selected questions for quiz.html
      try {
        localStorage.setItem('focustube_active_quiz', JSON.stringify(selected));
      } catch (e) {}

      // Render Ready State
      if (iconBox) {
        iconBox.style.backgroundColor = 'var(--color-primary-container)';
        iconBox.style.color = 'var(--color-on-primary)';
      }
      if (icon) icon.textContent = 'psychology';
      if (title) title.textContent = 'Cement memories immediately';
      if (subtitle) {
        subtitle.textContent = `Targeted reinforcement check with ${selected.length} concept question${selected.length === 1 ? '' : 's'} on what you missed.`;
      }
      if (badge) {
        badge.textContent = `${selected.length} QUESTIONS READY`;
        badge.style.color = 'var(--color-primary)';
        badge.style.background = 'rgba(99, 102, 241, 0.2)';
      }
      if (takeBtn) takeBtn.style.display = 'inline-flex';
      if (retryBtn) retryBtn.style.display = 'none';
      if (bottomTakeBtn) bottomTakeBtn.style.display = 'inline-flex';
      return;
    }

    if (status === 'preparing') {
      // Render Preparing State (Non-blocking)
      if (title) title.textContent = 'Quiz preparing…';
      if (subtitle) subtitle.textContent = 'Analyzing lecture concepts in the background. Your metrics and focus scores are fully loaded.';
      if (badge) {
        badge.textContent = 'GENERATING QUIZ…';
        badge.style.color = 'var(--color-tertiary)';
        badge.style.background = 'rgba(255, 185, 95, 0.15)';
      }
      if (takeBtn) takeBtn.style.display = 'none';
      if (retryBtn) retryBtn.style.display = 'none';

      // Listen for background completion
      const onReady = () => {
        window.removeEventListener('focustube:quiz-ready', onReady);
        this.setupActiveRecallQuiz();
      };
      window.addEventListener('focustube:quiz-ready', onReady, { once: true });
      return;
    }

    // Otherwise, generation failed or not started yet: Render Retry State (Never blocks)
    if (title) title.textContent = 'Quiz generation paused';
    if (subtitle) subtitle.textContent = 'Quiz questions could not be prepared automatically. Click retry to generate questions.';
    if (badge) {
      badge.textContent = 'QUIZ RETRY AVAILABLE';
      badge.style.color = 'var(--color-outline)';
      badge.style.background = 'rgba(70, 69, 84, 0.2)';
    }
    if (takeBtn) takeBtn.style.display = 'none';
    if (retryBtn) retryBtn.style.display = 'inline-flex';
  },

  /**
   * For each distraction, select the question whose startSec is within 90 seconds before that timestamp.
   * If none match, pick the nearest. Cap at 5 questions total.
   */
  selectQuestionsForDistractions(allQuestions, distractions) {
    if (!Array.isArray(allQuestions) || allQuestions.length === 0) return [];

    const selected = [];
    const usedQuestions = new Set();

    if (Array.isArray(distractions) && distractions.length > 0) {
      for (const d of distractions) {
        const dTime = d.videoTime || 0;

        // Condition: startSec within 90 seconds before timestamp: (dTime - 90 <= q.startSec && q.startSec <= dTime)
        const within90 = allQuestions.filter(q => {
          const s = q.startSec !== undefined ? q.startSec : (q.segmentStart || 0);
          return s >= (dTime - 90) && s <= dTime && !usedQuestions.has(q.question);
        });

        let chosen = null;

        if (within90.length > 0) {
          // Sort by proximity to dTime (closest to distraction moment)
          within90.sort((a, b) => {
            const sA = a.startSec !== undefined ? a.startSec : (a.segmentStart || 0);
            const sB = b.startSec !== undefined ? b.startSec : (b.segmentStart || 0);
            return (dTime - sA) - (dTime - sB);
          });
          chosen = within90[0];
        } else {
          // None match within 90s before: pick the nearest overall
          const pool = allQuestions.filter(q => !usedQuestions.has(q.question));
          const available = pool.length > 0 ? pool : allQuestions;
          const sorted = [...available].sort((a, b) => {
            const sA = a.startSec !== undefined ? a.startSec : (a.segmentStart || 0);
            const sB = b.startSec !== undefined ? b.startSec : (b.segmentStart || 0);
            return Math.abs(sA - dTime) - Math.abs(sB - dTime);
          });
          chosen = sorted[0];
        }

        if (chosen && !usedQuestions.has(chosen.question)) {
          usedQuestions.add(chosen.question);
          selected.push({
            ...chosen,
            distractionTime: dTime,
            isFromDistraction: true
          });
        }

        if (selected.length >= 5) break;
      }
    }

    // If 0 distractions or fewer than 3 questions found, fill up to 3 (or 5) from lecture
    if (selected.length < 3) {
      for (const q of allQuestions) {
        if (!usedQuestions.has(q.question)) {
          usedQuestions.add(q.question);
          selected.push({
            ...q,
            distractionTime: q.startSec || 0,
            isFromDistraction: false
          });
        }
        if (selected.length >= 3) break;
      }
    }

    // Cap at 5 questions total
    return selected.slice(0, 5);
  },

  formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    if (s < 60) return `0:${String(s).padStart(2, '0')}`;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
};

// Guard environments for modular usage in browser and unit testing in Node
if (typeof window !== 'undefined') {
  window.FocusTubeSummary = FocusTubeSummary;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubeSummary.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FocusTubeSummary };
}
