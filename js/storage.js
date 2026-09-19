/**
 * FocusTube - Local Storage Module
 * Manages persisting session history, settings, selected video, and recent custom videos.
 */

const FocusTubeStorage = {
  KEYS: {
    SELECTED_VIDEO_ID: 'focustube_selected_video_id',
    CURRENT_VIDEO: 'focustube_current_video',
    RECENT_CUSTOM_VIDEOS: 'focustube_recent_custom_videos',
    SESSIONS: 'focustube_sessions',
    CURRENT_SESSION: 'focustube_current_session',
    SETTINGS: 'focustube_settings',
    STREAK: 'focustube_streak',
    QUEUE: 'focustube_study_queue',
    QUEUE_INDEX: 'focustube_study_queue_index',
    VIDEO_DISTRACTIONS: 'focustube_video_distractions'
  },

  init() {
    console.log('[Storage] Initialized FocusTube Local Storage Module');
  },

  setSelectedVideoId(videoId) {
    try {
      localStorage.setItem(this.KEYS.SELECTED_VIDEO_ID, videoId);
    } catch (e) {
      console.error('[Storage] Error saving selected video ID:', e);
    }
  },

  getSelectedVideoId() {
    try {
      return localStorage.getItem(this.KEYS.SELECTED_VIDEO_ID) || 'mit-1806-l01';
    } catch (e) {
      console.error('[Storage] Error reading selected video ID:', e);
      return 'mit-1806-l01';
    }
  },

  hasSavedVideo() {
    try {
      if (typeof localStorage === 'undefined') return false;
      return Boolean(localStorage.getItem(this.KEYS.CURRENT_VIDEO) || localStorage.getItem(this.KEYS.SELECTED_VIDEO_ID));
    } catch (e) {
      return false;
    }
  },

  setCurrentVideo(videoObj) {
    try {
      if (!videoObj || !videoObj.videoId) return;
      localStorage.setItem(this.KEYS.CURRENT_VIDEO, JSON.stringify(videoObj));
      this.setSelectedVideoId(videoObj.videoId);
    } catch (e) {
      console.error('[Storage] Error setting current video:', e);
    }
  },

  getCurrentVideo() {
    try {
      const data = localStorage.getItem(this.KEYS.CURRENT_VIDEO);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[Storage] Error reading current video:', e);
    }
    // Default fallback
    const id = this.getSelectedVideoId();
    return {
      videoId: id,
      title: id === '3b1b-vectors' 
        ? 'Essence of Linear Algebra - Chapter 1: Vectors, what even are they?' 
        : 'MIT 18.06 Linear Algebra - Lecture 1: The Geometry of Linear Equations',
      custom: false
    };
  },

  getRecentVideos() {
    try {
      const data = localStorage.getItem(this.KEYS.RECENT_CUSTOM_VIDEOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[Storage] Error reading recent custom videos:', e);
      return [];
    }
  },

  addRecentVideo(videoObj) {
    try {
      if (!videoObj || !videoObj.videoId) return;
      let recents = this.getRecentVideos();
      // Filter duplicate
      recents = recents.filter(v => v.videoId !== videoObj.videoId);
      // Prepend
      recents.unshift({
        videoId: videoObj.videoId,
        title: videoObj.title || 'Custom Video',
        author: videoObj.author || 'YouTube',
        thumbnail: videoObj.thumbnail || `https://img.youtube.com/vi/${videoObj.videoId}/hqdefault.jpg`,
        custom: true,
        addedAt: new Date().toISOString()
      });
      // Limit to 5
      recents = recents.slice(0, 5);
      localStorage.setItem(this.KEYS.RECENT_CUSTOM_VIDEOS, JSON.stringify(recents));
    } catch (e) {
      console.error('[Storage] Error adding recent custom video:', e);
    }
  },

  getCurrentSession() {
    try {
      const data = localStorage.getItem(this.KEYS.CURRENT_SESSION);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('[Storage] Error reading current session:', e);
      return null;
    }
  },

  saveCurrentSession(sessionData) {
    try {
      if (!sessionData) return;
      localStorage.setItem(this.KEYS.CURRENT_SESSION, JSON.stringify(sessionData));
    } catch (e) {
      console.error('[Storage] Error saving current session:', e);
    }
  },

  // -------------------------------------------------------------
  // Study Queue Methods
  // -------------------------------------------------------------
  saveQueue(items) {
    try {
      if (!Array.isArray(items)) return;
      localStorage.setItem(this.KEYS.QUEUE, JSON.stringify(items));
      this.setCurrentQueueIndex(0);
    } catch (e) {
      console.error('[Storage] Error saving queue:', e);
    }
  },

  getQueue() {
    try {
      const data = localStorage.getItem(this.KEYS.QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[Storage] Error reading queue:', e);
      return [];
    }
  },

  hasQueue() {
    const queue = this.getQueue();
    return Array.isArray(queue) && queue.length > 0;
  },

  clearQueue() {
    try {
      localStorage.removeItem(this.KEYS.QUEUE);
      localStorage.removeItem(this.KEYS.QUEUE_INDEX);
    } catch (e) {
      console.error('[Storage] Error clearing queue:', e);
    }
  },

  getCurrentQueueIndex() {
    try {
      const idx = localStorage.getItem(this.KEYS.QUEUE_INDEX);
      return idx !== null ? parseInt(idx, 10) : 0;
    } catch (e) {
      return 0;
    }
  },

  setCurrentQueueIndex(index) {
    try {
      localStorage.setItem(this.KEYS.QUEUE_INDEX, index.toString());
    } catch (e) {
      console.error('[Storage] Error setting queue index:', e);
    }
  },

  getNextQueueItem() {
    const queue = this.getQueue();
    const currIdx = this.getCurrentQueueIndex();
    if (currIdx + 1 < queue.length) {
      return {
        item: queue[currIdx + 1],
        nextIndex: currIdx + 1
      };
    }
    return null;
  },

  // -------------------------------------------------------------
  // Per-Video Distraction Tracking
  // -------------------------------------------------------------
  saveVideoDistraction(distraction) {
    try {
      if (!distraction || !distraction.videoId) return;
      const raw = localStorage.getItem(this.KEYS.VIDEO_DISTRACTIONS);
      const all = raw ? JSON.parse(raw) : {};
      if (!all[distraction.videoId]) {
        all[distraction.videoId] = [];
      }
      all[distraction.videoId].push(distraction);
      localStorage.setItem(this.KEYS.VIDEO_DISTRACTIONS, JSON.stringify(all));
    } catch (e) {
      console.error('[Storage] Error saving per-video distraction:', e);
    }
  },

  getDistractionsForVideo(videoId) {
    try {
      const raw = localStorage.getItem(this.KEYS.VIDEO_DISTRACTIONS);
      const all = raw ? JSON.parse(raw) : {};
      return all[videoId] || [];
    } catch (e) {
      return [];
    }
  },

  getAllDistractions() {
    try {
      const raw = localStorage.getItem(this.KEYS.VIDEO_DISTRACTIONS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  // -------------------------------------------------------------
  // AI Recall Quiz Cache & Background Prefetching
  // -------------------------------------------------------------
  getQuiz(videoId) {
    try {
      if (!videoId) return null;
      const data = localStorage.getItem(`quiz:${videoId}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('[Storage] Error reading cached quiz:', e);
      return null;
    }
  },

  saveQuiz(videoId, questions) {
    try {
      if (!videoId || !Array.isArray(questions)) return;
      localStorage.setItem(`quiz:${videoId}`, JSON.stringify(questions));
      this.setQuizStatus(videoId, 'ready');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('focustube:quiz-ready', { detail: { videoId, count: questions.length } }));
      }
    } catch (e) {
      console.error('[Storage] Error saving quiz to cache:', e);
    }
  },

  getQuizStatus(videoId) {
    try {
      if (!videoId) return null;
      return localStorage.getItem(`quiz_status:${videoId}`) || (this.getQuiz(videoId) ? 'ready' : null);
    } catch (e) {
      return null;
    }
  },

  setQuizStatus(videoId, status) {
    try {
      if (!videoId) return;
      localStorage.setItem(`quiz_status:${videoId}`, status);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('focustube:quiz-status', { detail: { videoId, status } }));
      }
    } catch (e) {}
  },

  /**
   * Resolves API endpoint URL.
   * If running on Live Server (e.g., port 5500/5501) or other local dev port different from 8000,
   * automatically targets the FocusTube Node server running at http://localhost:8000.
   */
  getApiUrl(endpoint) {
    if (typeof window !== 'undefined' && window.location) {
      const { hostname, port } = window.location;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      if (isLocalhost && port && port !== '8000') {
        const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `http://localhost:8000${cleanPath}`;
      }
    }
    return endpoint;
  },

  async prefetchQuiz(videoId, metadata = {}) {
    if (!videoId) return;
    const cached = this.getQuiz(videoId);
    if (cached && cached.length > 0) {
      this.setQuizStatus(videoId, 'ready');
      return cached;
    }

    this.setQuizStatus(videoId, 'preparing');

    try {
      let query = `videoId=${encodeURIComponent(videoId)}`;
      if (metadata && metadata.title) {
        query += `&title=${encodeURIComponent(metadata.title)}`;
      }
      const channel = metadata && (metadata.channel || metadata.author);
      if (channel) {
        query += `&channel=${encodeURIComponent(channel)}`;
      }
      const apiUrl = this.getApiUrl(`/api/quiz?${query}`);
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          this.saveQuiz(videoId, data.questions);
          return data.questions;
        }
      }
      this.setQuizStatus(videoId, 'error');
    } catch (err) {
      console.warn('[Storage] Background quiz prefetch error:', err);
      this.setQuizStatus(videoId, 'error');
    }
    return null;
  }
};

if (typeof window !== 'undefined') {
  window.FocusTubeStorage = FocusTubeStorage;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => FocusTubeStorage.init());
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FocusTubeStorage };
}
