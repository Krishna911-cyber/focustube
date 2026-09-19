/**
 * FocusTube - Video & Playlist Input Module
 * Handles parsing YouTube video and playlist URLs/IDs, oEmbed & API validation,
 * playlist preview checklist with checkboxes, and queue management.
 */

/**
 * Extracts an 11-character YouTube video ID from various input formats.
 */
function getVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  // 1. Bare 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // 2. Parse URL
  let url;
  try {
    const hasProtocol = /^https?:\/\//i.test(str);
    url = new URL(hasProtocol ? str : `https://${str}`);
  } catch (e) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const validDomains = ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'];
  if (!validDomains.includes(hostname)) {
    return null;
  }

  // youtu.be/<id>
  if (hostname === 'youtu.be') {
    const pathnameParts = url.pathname.split('/').filter(Boolean);
    if (pathnameParts.length > 0) {
      const id = pathnameParts[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    return null;
  }

  // /watch?v=<id>
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v');
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  // /shorts/<id>
  const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) {
    return shortsMatch[1];
  }

  // /embed/<id>
  const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) {
    return embedMatch[1];
  }

  // /live/<id>
  const liveMatch = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})/);
  if (liveMatch) {
    return liveMatch[1];
  }

  return null;
}

/**
 * Extracts a YouTube playlist ID from URL or bare ID.
 */
function getPlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  // Bare playlist ID (starts with PL, UU, FL, RD, etc. 12-64 chars)
  if (/^[a-zA-Z0-9_-]{12,64}$/.test(str) && /^(PL|UU|FL|RD|OL)/i.test(str)) {
    return str;
  }

  try {
    const hasProtocol = /^https?:\/\//i.test(str);
    const url = new URL(hasProtocol ? str : `https://${str}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const validDomains = ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'];
    if (!validDomains.includes(hostname)) return null;

    const listParam = url.searchParams.get('list');
    if (listParam && /^[a-zA-Z0-9_-]{12,64}$/.test(listParam)) {
      return listParam;
    }
  } catch (e) {}

  return null;
}

/**
 * Parses user input into either a video or playlist target
 */
function parseYouTubeInput(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  const playlistId = getPlaylistId(str);

  // If input is explicitly a playlist URL or bare playlist ID
  if (playlistId) {
    let isExplicitPlaylist = false;
    try {
      const hasProtocol = /^https?:\/\//i.test(str);
      const url = new URL(hasProtocol ? str : `https://${str}`);
      if (url.pathname === '/playlist' || !url.searchParams.get('v')) {
        isExplicitPlaylist = true;
      }
    } catch (e) {
      isExplicitPlaylist = true;
    }

    if (isExplicitPlaylist) {
      return { type: 'playlist', id: playlistId };
    }
  }

  // Check if it's a video
  const videoId = getVideoId(str);
  if (videoId) {
    return { type: 'video', id: videoId, playlistId: playlistId || null };
  }

  // Fallback to playlist if list param exists
  if (playlistId) {
    return { type: 'playlist', id: playlistId };
  }

  return null;
}

if (typeof window !== 'undefined') {
  window.getVideoId = getVideoId;
  window.getPlaylistId = getPlaylistId;
  window.parseYouTubeInput = parseYouTubeInput;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getVideoId, getPlaylistId, parseYouTubeInput };
}

const VideoInputController = {
  currentValidatedVideo: null,
  currentPlaylistData: null,

  init() {
    this.bindElements();
    this.renderRecentVideos();
  },

  bindElements() {
    this.form = document.getElementById('paste-url-form');
    this.input = document.getElementById('video-url-input');
    this.submitBtn = document.getElementById('add-video-btn');
    this.errorBox = document.getElementById('paste-error-box');
    this.confirmCard = document.getElementById('paste-confirm-card');
    this.recentContainer = document.getElementById('recent-custom-videos-container');
    this.recentGrid = document.getElementById('recent-custom-videos-grid');

    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }

    if (this.input) {
      this.input.addEventListener('input', () => {
        this.hideError();
      });
    }
  },

  showError(message) {
    if (!this.errorBox) return;
    this.errorBox.textContent = message;
    this.errorBox.style.display = 'flex';
    if (this.confirmCard) {
      this.confirmCard.style.display = 'none';
    }
  },

  hideError() {
    if (!this.errorBox) return;
    this.errorBox.textContent = '';
    this.errorBox.style.display = 'none';
  },

  setLoading(isLoading, label = 'Validating...') {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = isLoading;
    if (isLoading) {
      this.submitBtn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite;">progress_activity</span>
        <span>${label}</span>
      `;
    } else {
      this.submitBtn.innerHTML = `
        <span class="material-symbols-outlined">add</span>
        <span>Add to queue</span>
      `;
    }
  },

  async handleSubmit() {
    this.hideError();
    const rawVal = this.input ? this.input.value : '';
    const parsed = parseYouTubeInput(rawVal);

    if (!parsed) {
      this.showError("This video or playlist can't be used. Please enter a valid YouTube link or ID.");
      return;
    }

    if (parsed.type === 'playlist') {
      await this.handlePlaylistSubmit(parsed.id);
    } else {
      await this.handleVideoSubmit(parsed.id);
    }
  },

  async handlePlaylistSubmit(playlistId) {
    this.setLoading(true, 'Importing playlist...');

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

    try {
      const apiUrl = getApiUrl(`/api/playlist?playlistId=${encodeURIComponent(playlistId)}`);
      const res = await fetch(apiUrl);
      const contentType = res.headers.get('content-type') || '';

      let data = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 404 || text.includes('<!DOCTYPE')) {
          throw new Error('The FocusTube backend API is not responding on /api/playlist. Please make sure the FocusTube Node server is running on port 8000 (run `npm start` or `node server.js 8000`) and access http://localhost:8000.');
        }
        throw new Error(`Server returned unexpected response (${res.status}).`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.message || 'Unable to import playlist.');
      }

      if (!data.items || data.items.length === 0) {
        throw new Error('This playlist contains no available videos.');
      }

      this.currentPlaylistData = data;
      this.showPlaylistPreview(data);
    } catch (err) {
      console.warn('[VideoInput] Playlist error:', err);
      let errMsg = err.message || "This playlist can't be used. It may be private, deleted, or a Mix.";
      if (err.name === 'TypeError' && String(err.message).toLowerCase().includes('fetch')) {
        errMsg = 'Cannot reach the FocusTube Node server on port 8000. Please run `npm start` (or `node server.js 8000`) in your terminal, or open http://localhost:8000.';
      }
      this.showError(errMsg);
    } finally {
      this.setLoading(false);
    }
  },

  async handleVideoSubmit(videoId) {
    this.setLoading(true, 'Validating video...');

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
      const res = await fetch(oembedUrl);

      if (!res.ok) {
        throw new Error(`oEmbed failed with status ${res.status}`);
      }

      const data = await res.json();
      const validatedVideo = {
        videoId: videoId,
        title: data.title || `YouTube Video (${videoId})`,
        author: data.author_name || 'YouTube Creator',
        thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        custom: true
      };

      this.currentValidatedVideo = validatedVideo;
      this.showSingleConfirmation(validatedVideo);
    } catch (err) {
      console.warn('[VideoInput] Video validation failure:', err);
      this.showError("This video can't be used. It may be private, deleted, or not allow embedding.");
    } finally {
      this.setLoading(false);
    }
  },

  showSingleConfirmation(video) {
    if (!this.confirmCard) return;
    this.confirmCard.innerHTML = `
      <div class="confirm-card-inner">
        <div class="confirm-thumb-box">
          <img src="${video.thumbnail}" alt="${video.title}" />
          <div class="video-clean-tag" style="position: absolute; bottom: 8px; left: 8px;">
            <span class="material-symbols-outlined" style="font-size: 13px;">shield</span>
            <span>Custom Lecture</span>
          </div>
        </div>
        <div class="confirm-info-box">
          <span class="video-channel-tag">${video.author}</span>
          <h4 class="confirm-title">${video.title}</h4>
          <p style="font-size: var(--text-body-sm); color: var(--color-on-surface-variant);">
            Verified via YouTube. Autonomic attention tracking and distraction recovery are armed.
          </p>
          <div style="display: flex; align-items: center; gap: var(--space-sm); margin-top: auto; padding-top: var(--space-xs);">
            <button class="btn btn-primary" id="confirm-start-study-btn" type="button">
              <span class="material-symbols-outlined">play_arrow</span>
              <span>Start studying</span>
            </button>
            <button class="btn btn-ghost btn-sm" id="confirm-cancel-btn" type="button">
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    `;
    this.confirmCard.style.display = 'block';

    const startBtn = document.getElementById('confirm-start-study-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.launchSingleVideo(video);
      });
    }

    const cancelBtn = document.getElementById('confirm-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.confirmCard.style.display = 'none';
        this.currentValidatedVideo = null;
      });
    }
  },

  showPlaylistPreview(data) {
    if (!this.confirmCard) return;

    const items = data.items || [];
    const rowsHtml = items.map((item, idx) => `
      <label class="playlist-row-item" data-index="${idx}">
        <input type="checkbox" class="playlist-checkbox" data-idx="${idx}" checked />
        <span class="playlist-row-num font-mono">#${item.position || (idx + 1)}</span>
        <div class="playlist-row-thumb">
          <img src="${item.thumbnail}" alt="${item.title}" loading="lazy" />
        </div>
        <div class="playlist-row-info">
          <h5 class="playlist-row-title">${item.title}</h5>
          <span class="playlist-row-channel">${item.channel || ''}</span>
        </div>
      </label>
    `).join('');

    this.confirmCard.innerHTML = `
      <div class="playlist-preview-card">
        <div class="playlist-preview-header">
          <div style="display: flex; align-items: center; gap: var(--space-xs);">
            <span class="material-symbols-outlined" style="color: var(--color-primary); font-size: 24px;">playlist_play</span>
            <div>
              <h4 style="font-size: var(--text-headline-sm); font-weight: 600;">${data.title || 'YouTube Study Playlist'}</h4>
              <p style="font-size: var(--text-body-sm); color: var(--color-on-surface-variant); margin-top: 2px;">
                ${items.length} lectures found. All selected by default. Choose which lectures to add to your study queue.
              </p>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" id="playlist-toggle-all-btn" type="button" style="font-size: var(--text-label-sm);">
            Deselect all
          </button>
        </div>

        <div class="playlist-checklist-scroll">
          ${rowsHtml}
        </div>

        <div class="playlist-preview-footer">
          <div style="font-size: var(--text-label-sm); color: var(--color-outline);">
            <span id="playlist-selected-count" class="font-mono" style="color: var(--color-primary); font-weight: 600;">${items.length}</span> of ${items.length} lectures selected
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <button class="btn btn-ghost btn-sm" id="playlist-cancel-btn" type="button">
              <span>Cancel</span>
            </button>
            <button class="btn btn-primary" id="start-playlist-study-btn" type="button">
              <span class="material-symbols-outlined">play_arrow</span>
              <span id="start-playlist-btn-text">Start studying (${items.length} lectures)</span>
            </button>
          </div>
        </div>
      </div>
    `;
    this.confirmCard.style.display = 'block';

    const checkboxes = this.confirmCard.querySelectorAll('.playlist-checkbox');
    const selectedCountEl = document.getElementById('playlist-selected-count');
    const startBtn = document.getElementById('start-playlist-study-btn');
    const startBtnText = document.getElementById('start-playlist-btn-text');
    const toggleAllBtn = document.getElementById('playlist-toggle-all-btn');

    let allChecked = true;

    const updateSelectionUI = () => {
      const checkedBoxes = Array.from(checkboxes).filter(cb => cb.checked);
      const count = checkedBoxes.length;

      if (selectedCountEl) selectedCountEl.textContent = count;
      if (startBtnText) startBtnText.textContent = `Start studying (${count} ${count === 1 ? 'lecture' : 'lectures'})`;
      if (startBtn) startBtn.disabled = count === 0;

      allChecked = count === checkboxes.length;
      if (toggleAllBtn) {
        toggleAllBtn.textContent = allChecked ? 'Deselect all' : 'Select all';
      }
    };

    checkboxes.forEach(cb => {
      cb.addEventListener('change', updateSelectionUI);
    });

    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => {
        const targetState = !allChecked;
        checkboxes.forEach(cb => { cb.checked = targetState; });
        updateSelectionUI();
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const selectedItems = [];
        checkboxes.forEach(cb => {
          if (cb.checked) {
            const idx = parseInt(cb.dataset.idx, 10);
            if (items[idx]) selectedItems.push(items[idx]);
          }
        });

        if (selectedItems.length === 0) {
          alert('Please select at least one lecture to study.');
          return;
        }

        this.launchPlaylist(selectedItems);
      });
    }

    const cancelBtn = document.getElementById('playlist-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.confirmCard.style.display = 'none';
        this.currentPlaylistData = null;
      });
    }
  },

  launchSingleVideo(video) {
    if (window.FocusTubeStorage) {
      // Save 1-item queue
      window.FocusTubeStorage.saveQueue([{
        position: 1,
        videoId: video.videoId,
        title: video.title,
        channel: video.author || 'YouTube',
        thumbnail: video.thumbnail
      }]);

      window.FocusTubeStorage.setCurrentVideo({
        videoId: video.videoId,
        title: video.title,
        author: video.author,
        thumbnail: video.thumbnail,
        custom: true
      });
      window.FocusTubeStorage.addRecentVideo(video);
      window.FocusTubeStorage.prefetchQuiz(video.videoId);
    }
    window.location.href = 'study.html';
  },

  launchPlaylist(selectedItems) {
    if (window.FocusTubeStorage) {
      window.FocusTubeStorage.saveQueue(selectedItems);

      const first = selectedItems[0];
      window.FocusTubeStorage.setCurrentVideo({
        videoId: first.videoId,
        title: first.title,
        author: first.channel,
        thumbnail: first.thumbnail,
        custom: true
      });
      window.FocusTubeStorage.addRecentVideo({
        videoId: first.videoId,
        title: first.title,
        author: first.channel,
        thumbnail: first.thumbnail
      });
      window.FocusTubeStorage.prefetchQuiz(first.videoId);
    }
    window.location.href = 'study.html';
  },

  renderRecentVideos() {
    if (!this.recentContainer || !this.recentGrid) return;

    const recents = window.FocusTubeStorage ? window.FocusTubeStorage.getRecentVideos() : [];
    if (!recents || recents.length === 0) {
      this.recentContainer.style.display = 'none';
      return;
    }

    this.recentContainer.style.display = 'block';
    this.recentGrid.innerHTML = '';

    recents.forEach(video => {
      const card = document.createElement('div');
      card.className = 'recent-video-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Study recent lecture: ${video.title}`);

      card.innerHTML = `
        <div class="recent-thumb-wrapper">
          <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
          <div class="recent-play-hover">
            <span class="material-symbols-outlined">play_arrow</span>
          </div>
        </div>
        <div class="recent-meta-wrapper">
          <span class="video-channel-tag" style="font-size: 10px;">${video.author || 'Custom'}</span>
          <h5 class="recent-card-title">${video.title}</h5>
        </div>
      `;

      const launch = () => {
        this.launchSingleVideo(video);
      };

      card.addEventListener('click', launch);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          launch();
        }
      });

      this.recentGrid.appendChild(card);
    });
  }
};

if (typeof window !== 'undefined') {
  window.VideoInputController = VideoInputController;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => VideoInputController.init());
  }
}
