/**
 * FocusTube - Active Recall Quiz Controller
 * 
 * Matches user's distraction timestamps to the nearest pre-generated quiz segment,
 * renders the Stitch-styled question card and options, provides instant right/wrong
 * feedback with pedagogical explanation, and enables an in-page replay player
 * seeking to 5s before the distracted moment.
 * 
 * NOTE: Strictly adheres to requirement: DO NOT call any LLM API from the front end.
 * All questions are loaded directly from data/quizzes/<videoId>.json.
 */

const FocusTubeQuiz = {
  currentVideo: null,
  currentSession: null,
  quizData: [],
  selectedQuestions: [],
  currentIndex: 0,
  ytPlayer: null,
  isPlayerReady: false,
  pendingSeekTime: 0,

  async init() {
    this.loadSessionAndVideo();
    await this.loadQuizData();
    this.matchQuestionsToDistractions();
    this.bindEvents();
    this.renderSourceLectureStrip();
    this.renderQuestion(0);
    this.initYouTubeAPI();
    console.log('[Quiz] FocusTube Recall Quiz Initialized. Questions loaded:', this.selectedQuestions.length);
  },

  loadSessionAndVideo() {
    // 1. Current Video
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      this.currentVideo = window.FocusTubeStorage.getCurrentVideo();
    }
    if (!this.currentVideo) {
      this.currentVideo = {
        videoId: 'mit-1806-l01',
        title: 'MIT 18.06 Linear Algebra - Lecture 1: The Geometry of Linear Equations',
        author: 'MIT OpenCourseWare',
        youtubeId: 'J7DzL2_Na80',
        thumbnail: 'assets/mit-1806-thumb.jpg',
        custom: false
      };
    }

    // 2. Current Session
    if (typeof window !== 'undefined' && window.FocusTubeStorage) {
      this.currentSession = window.FocusTubeStorage.getCurrentSession();
    }
    if (!this.currentSession) {
      this.currentSession = {
        videoId: this.currentVideo.videoId,
        startedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        totalStudyTimeSec: 1500,
        distractions: [
          { type: 'tab_hidden', videoTime: 252, durationSec: 47 },
          { type: 'window_blur', videoTime: 580, durationSec: 75 }
        ]
      };
    }
  },

  async loadQuizData() {
    // 1. Check if active quiz was pre-selected on summary page
    try {
      const activeRaw = localStorage.getItem('focustube_active_quiz');
      if (activeRaw) {
        const parsed = JSON.parse(activeRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.selectedQuestions = parsed.map(q => ({
            ...q,
            startSec: q.startSec !== undefined ? q.startSec : (q.segmentStart || 0),
            userSelectedIndex: null,
            isAnswered: false,
            isCorrect: false
          }));
          console.log('[Quiz] Loaded pre-selected active questions from storage:', this.selectedQuestions.length);
          return;
        }
      }
    } catch (e) {}

    // 2. Check cached quiz in storage under quiz:<videoId>
    const videoId = this.currentVideo ? this.currentVideo.videoId : 'mit-1806-l01';
    if (window.FocusTubeStorage) {
      const cached = window.FocusTubeStorage.getQuiz(videoId);
      if (cached && cached.length > 0) {
        this.quizData = cached;
        return;
      }
    }

    // 3. Query /api/quiz?videoId=...
    try {
      const getApiUrl = (endpoint) => {
        if (window.FocusTubeStorage && typeof window.FocusTubeStorage.getApiUrl === 'function') {
          return window.FocusTubeStorage.getApiUrl(endpoint);
        }
        const { hostname, port } = window.location;
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '8000') {
          return `http://localhost:8000${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
        }
        return endpoint;
      };

      const apiUrl = getApiUrl(`/api/quiz?videoId=${encodeURIComponent(videoId)}`);
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          this.quizData = data.questions;
          if (window.FocusTubeStorage) {
            window.FocusTubeStorage.saveQuiz(videoId, data.questions);
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[Quiz] Error fetching /api/quiz:', e);
    }

    // 4. Fallback to local data file
    try {
      const fallbackRes = await fetch('data/quizzes/mit-1806-l01.json');
      if (fallbackRes.ok) {
        this.quizData = await fallbackRes.json();
      }
    } catch (e2) {
      this.quizData = [];
    }
  },

  /**
   * Matches each of user's distraction timestamps to the nearest cached segment.
   * If distractions are empty, picks foundational questions.
   */
  matchQuestionsToDistractions() {
    if (this.selectedQuestions && this.selectedQuestions.length > 0) {
      return; // Already loaded from focustube_active_quiz
    }

    if (!this.quizData || this.quizData.length === 0) {
      this.selectedQuestions = [];
      return;
    }

    const distractions = (this.currentSession && this.currentSession.distractions) || [];
    const selected = [];
    const usedQuestions = new Set();

    if (distractions.length > 0) {
      for (const d of distractions) {
        const dTime = d.videoTime || 0;

        // Condition: startSec within 90 seconds before timestamp: (dTime - 90 <= q.startSec && q.startSec <= dTime)
        const within90 = this.quizData.filter(q => {
          const s = q.startSec !== undefined ? q.startSec : (q.segmentStart || 0);
          return s >= (dTime - 90) && s <= dTime && !usedQuestions.has(q.question);
        });

        let chosen = null;

        if (within90.length > 0) {
          within90.sort((a, b) => {
            const sA = a.startSec !== undefined ? a.startSec : (a.segmentStart || 0);
            const sB = b.startSec !== undefined ? b.startSec : (b.segmentStart || 0);
            return (dTime - sA) - (dTime - sB);
          });
          chosen = within90[0];
        } else {
          // None match within 90s before: pick nearest
          const pool = this.quizData.filter(q => !usedQuestions.has(q.question));
          const available = pool.length > 0 ? pool : this.quizData;
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
            startSec: chosen.startSec !== undefined ? chosen.startSec : (chosen.segmentStart || 0),
            distractionTime: dTime,
            isFromDistraction: true,
            userSelectedIndex: null,
            isAnswered: false,
            isCorrect: false
          });
        }

        if (selected.length >= 5) break;
      }
    }

    if (selected.length < 3) {
      for (const q of this.quizData) {
        if (!usedQuestions.has(q.question)) {
          usedQuestions.add(q.question);
          selected.push({
            ...q,
            startSec: q.startSec !== undefined ? q.startSec : (q.segmentStart || 0),
            distractionTime: q.startSec || 0,
            isFromDistraction: false,
            userSelectedIndex: null,
            isAnswered: false,
            isCorrect: false
          });
        }
        if (selected.length >= 3) break;
      }
    }

    this.selectedQuestions = selected.slice(0, 5);
  },

  bindEvents() {
    // Prev button
    const prevBtn = document.getElementById('quiz-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.prevQuestion());
    }

    // Next button
    const nextBtn = document.getElementById('quiz-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextQuestion());
    }

    // Rewatch CTA button in feedback box
    const rewatchBtn = document.getElementById('quiz-rewatch-btn');
    if (rewatchBtn) {
      rewatchBtn.addEventListener('click', () => {
        const currentQ = this.selectedQuestions[this.currentIndex];
        if (currentQ) {
          const timestamp = currentQ.startSec !== undefined ? currentQ.startSec : (currentQ.segmentStart || currentQ.distractionTime || 0);
          const seekSec = Math.max(0, timestamp - 5);
          this.openReplayModal(seekSec);
        }
      });
    }

    // Replay modal close buttons
    const closeBtn = document.getElementById('quiz-replay-modal-close');
    const doneBtn = document.getElementById('quiz-replay-modal-done-btn');
    const modal = document.getElementById('quiz-replay-modal');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeReplayModal());
    if (doneBtn) doneBtn.addEventListener('click', () => this.closeReplayModal());
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeReplayModal();
      });
    }

    // ESC key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeReplayModal();
    });
  },

  renderQuestion(index) {
    if (index < 0 || index >= this.selectedQuestions.length) return;
    this.currentIndex = index;
    const q = this.selectedQuestions[index];
    const total = this.selectedQuestions.length;

    // 1. Progress Indicator & Numbers
    const currentNumEl = document.getElementById('quiz-current-num');
    const totalNumEl = document.getElementById('quiz-total-num');
    if (currentNumEl) currentNumEl.textContent = index + 1;
    if (totalNumEl) totalNumEl.textContent = total;

    // 2. Segmented Progress Bar
    const trackEl = document.getElementById('quiz-progress-track');
    if (trackEl) {
      trackEl.style.gridTemplateColumns = `repeat(${total}, 1fr)`;
      trackEl.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const seg = document.createElement('div');
        seg.className = 'quiz-progress-segment';
        if (this.selectedQuestions[i].isAnswered) {
          seg.classList.add('completed');
        } else if (i === index) {
          seg.classList.add('active');
        }
        trackEl.appendChild(seg);
      }
    }

    // 3. Time capsule & concept pills
    const timePillText = document.getElementById('quiz-origin-time-text');
    const conceptText = document.getElementById('quiz-concept-text');
    const timestampFormatted = this.formatTime(q.distractionTime || q.startSec || q.segmentStart || 0);

    if (timePillText) {
      if (q.isFromDistraction) {
        timePillText.textContent = `From ${timestampFormatted} • Moment You Zoned Out`;
      } else {
        timePillText.textContent = `From ${timestampFormatted} • Foundation Recall`;
      }
    }

    if (conceptText) {
      conceptText.textContent = this.getConceptName(q.startSec !== undefined ? q.startSec : (q.segmentStart || 0));
    }

    // 4. Question Stem
    const stemEl = document.getElementById('quiz-question-stem');
    if (stemEl) {
      stemEl.textContent = q.question;
    }

    // 5. Answer Options
    const optionsGroup = document.getElementById('quiz-options-group');
    if (optionsGroup) {
      optionsGroup.innerHTML = '';
      const letters = ['A', 'B', 'C', 'D'];

      q.options.forEach((optText, optIdx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option-btn';
        btn.setAttribute('data-index', optIdx);

        // State classes if already answered
        if (q.isAnswered) {
          btn.disabled = true;
          if (optIdx === q.correctIndex) {
            btn.classList.add('correct');
          } else if (optIdx === q.userSelectedIndex) {
            btn.classList.add('incorrect');
          } else {
            btn.classList.add('dimmed');
          }
        }

        const leftDiv = document.createElement('div');
        leftDiv.className = 'quiz-option-left';

        const letterSpan = document.createElement('span');
        letterSpan.className = 'quiz-option-letter';
        letterSpan.textContent = letters[optIdx] || (optIdx + 1);

        const textSpan = document.createElement('span');
        textSpan.className = 'quiz-option-text';
        textSpan.textContent = optText;

        leftDiv.appendChild(letterSpan);
        leftDiv.appendChild(textSpan);

        const indicator = document.createElement('span');
        indicator.className = 'quiz-option-radio-indicator';
        if (q.isAnswered) {
          if (optIdx === q.correctIndex) {
            indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">check</span>';
          } else if (optIdx === q.userSelectedIndex) {
            indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">close</span>';
          }
        }

        btn.appendChild(leftDiv);
        btn.appendChild(indicator);

        btn.addEventListener('click', () => this.handleAnswer(optIdx));
        optionsGroup.appendChild(btn);
      });
    }

    // 6. Feedback Box
    const feedbackBox = document.getElementById('quiz-feedback-box');
    const feedbackIcon = document.getElementById('quiz-feedback-icon');
    const feedbackTitle = document.getElementById('quiz-feedback-title');
    const explanationEl = document.getElementById('quiz-explanation-text');
    const rewatchLabel = document.getElementById('quiz-rewatch-btn-label');

    if (feedbackBox) {
      if (q.isAnswered) {
        feedbackBox.style.display = 'block';
        if (q.isCorrect) {
          feedbackBox.className = 'quiz-feedback-box correct';
          if (feedbackIcon) feedbackIcon.textContent = '🎯';
          if (feedbackTitle) {
            feedbackTitle.innerHTML = '<strong class="text-secondary font-semibold">Spot on!</strong> Precision recall achieved.';
          }
        } else {
          feedbackBox.className = 'quiz-feedback-box incorrect';
          if (feedbackIcon) feedbackIcon.textContent = '💡';
          if (feedbackTitle) {
            feedbackTitle.innerHTML = '<strong style="color: var(--color-tertiary); font-weight: 600;">Key Concept:</strong> Re-cementing memory trace.';
          }
        }
        if (explanationEl) {
          explanationEl.textContent = q.explanation || 'Reviewing the concept right after study blocks ensures optimal retention.';
        }
        if (rewatchLabel) {
          rewatchLabel.textContent = '▶ Rewatch this moment';
        }
      } else {
        feedbackBox.style.display = 'none';
      }
    }

    // 7. Nav Buttons Update
    const prevBtn = document.getElementById('quiz-prev-btn');
    if (prevBtn) {
      prevBtn.disabled = (index === 0);
    }

    const nextBtn = document.getElementById('quiz-next-btn');
    const nextBtnText = document.getElementById('quiz-next-btn-text');
    if (nextBtnText) {
      if (index === total - 1) {
        nextBtnText.textContent = q.isAnswered ? 'Finish Quiz & View Summary' : 'Complete Quiz';
      } else {
        nextBtnText.textContent = `Next question (${index + 2} of ${total})`;
      }
    }

    // Lecture preview strip timestamp badge
    const badgeEl = document.getElementById('quiz-lecture-timestamp-badge');
    if (badgeEl) {
      badgeEl.textContent = timestampFormatted;
    }
  },

  handleAnswer(chosenIndex) {
    const q = this.selectedQuestions[this.currentIndex];
    if (!q || q.isAnswered) return;

    q.userSelectedIndex = chosenIndex;
    q.isAnswered = true;
    q.isCorrect = (chosenIndex === q.correctIndex);

    // Re-render current question with instant feedback
    this.renderQuestion(this.currentIndex);
  },

  nextQuestion() {
    const currentQ = this.selectedQuestions[this.currentIndex];
    const total = this.selectedQuestions.length;

    if (this.currentIndex < total - 1) {
      this.renderQuestion(this.currentIndex + 1);
    } else {
      // Completed all questions
      this.showCompletionCard();
    }
  },

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.renderQuestion(this.currentIndex - 1);
    }
  },

  showCompletionCard() {
    const questionCard = document.getElementById('quiz-question-card');
    const navControls = document.getElementById('quiz-nav-controls');
    const completionCard = document.getElementById('quiz-completion-card');
    const scoreEl = document.getElementById('quiz-completion-score');

    if (questionCard) questionCard.style.display = 'none';
    if (navControls) navControls.style.display = 'none';
    if (completionCard) completionCard.style.display = 'flex';

    // Calculate score
    const total = this.selectedQuestions.length;
    const correctCount = this.selectedQuestions.filter(q => q.isCorrect).length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 100;

    if (scoreEl) {
      scoreEl.textContent = `${correctCount} / ${total} (${pct}%)`;
    }
  },

  renderSourceLectureStrip() {
    const video = this.currentVideo;
    if (!video) return;

    const titleEl = document.getElementById('quiz-lecture-title');
    const channelEl = document.getElementById('quiz-lecture-channel');
    const thumbEl = document.getElementById('quiz-lecture-thumb');

    if (titleEl && video.title) titleEl.textContent = video.title;
    if (channelEl) channelEl.textContent = video.author || video.channel || 'Educational Lecture';
    if (thumbEl && video.thumbnail) {
      thumbEl.src = video.thumbnail;
      thumbEl.alt = video.title || 'Lecture Thumbnail';
    }
  },

  getConceptName(segmentStart) {
    if (this.currentVideo && Array.isArray(this.currentVideo.chapters)) {
      const chapters = [...this.currentVideo.chapters].sort((a, b) => a.time - b.time);
      let match = chapters[0]?.title || 'Core Foundation';
      for (const ch of chapters) {
        if (segmentStart >= ch.time) {
          match = ch.title;
        }
      }
      return match;
    }

    if (segmentStart < 300) return 'Linear Geometry & Row Picture';
    if (segmentStart < 700) return 'Column Picture Geometry';
    if (segmentStart < 1200) return 'Matrix Form Ax = b';
    return 'Vector Operations & Elimination';
  },

  formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  },

  // --------------------------------------------------------------------------
  // IN-PAGE REPLAY MODAL LOGIC
  // --------------------------------------------------------------------------

  initYouTubeAPI() {
    if (typeof window === 'undefined') return;
    if (window.YT && window.YT.Player) {
      this.isPlayerReady = true;
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      this.isPlayerReady = true;
    };
  },

  openReplayModal(startSeconds) {
    const modal = document.getElementById('quiz-replay-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const rawId = (this.currentVideo && (this.currentVideo.youtubeId || this.currentVideo.videoId)) || 'J7DzL2_Na80';
    const youtubeId = (rawId === 'mit-1806-l01') ? 'J7DzL2_Na80' : (rawId === '3b1b-vectors' ? 'fNk_zzaMoSs' : rawId);

    this.pendingSeekTime = Math.max(0, Math.floor(startSeconds));

    if (this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      try {
        this.ytPlayer.seekTo(this.pendingSeekTime, true);
        this.ytPlayer.playVideo();
      } catch (err) {
        console.warn('[Quiz Replay] Seek error:', err);
      }
    } else {
      this.createReplayPlayer(youtubeId, this.pendingSeekTime);
    }
  },

  closeReplayModal() {
    const modal = document.getElementById('quiz-replay-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';

    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try {
        this.ytPlayer.pauseVideo();
      } catch (err) {
        console.warn('[Quiz Replay] Pause error on close:', err);
      }
    }
  },

  createReplayPlayer(youtubeId, startSeconds) {
    if (typeof window === 'undefined' || !window.YT || !window.YT.Player) {
      window.onYouTubeIframeAPIReady = () => {
        this.createReplayPlayer(youtubeId, startSeconds);
      };
      return;
    }

    try {
      this.ytPlayer = new window.YT.Player('quiz-replay-player', {
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
              console.warn('[Quiz Replay] onReady error:', err);
            }
          }
        }
      });
    } catch (err) {
      console.error('[Quiz Replay] Player creation error:', err);
    }
  }
};

// Auto initialize on DOM ready
if (typeof window !== 'undefined') {
  window.FocusTubeQuiz = FocusTubeQuiz;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubeQuiz.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FocusTubeQuiz;
}
