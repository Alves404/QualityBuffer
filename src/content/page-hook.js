/**
 * My Quality 4k - Page Hook Engine (MAIN World)
 *
 * Executes in the main page context at document_start before YouTube initializes
 * its HTML5 player (#movie_player) and MediaSource Extensions (MSE).
 *
 * Core responsibilities:
 * 1. Hardware Codec Filtering: Blocks software-heavy AV1 (av01) and 10-bit HDR (vp09.02)
 *    so low-to-mid-range GPUs decode 4K (2160p) via hardware-accelerated VP9 Profile 0.
 * 2. MSE Buffer Stabilization: Hooks MediaSource.prototype.addSourceBuffer to monitor
 *    chunk ingestion and automatically jump over MSE segment micro-gaps.
 * 3. Quality Range Enforcement: Locks YouTube player heuristic to 4K (hd2160) or highest
 *    available stream without mid-stream ABR flushes.
 * 4. Compositor & Ambient Optimization: Disables GPU-draining background canvas effects.
 *
 * Assisted engineering by Argon (Google Antigravity).
 * License: GPL-3.0
 */

(function () {
  'use strict';

  if (window.__MQ4K_INITIALIZED__) {
    return;
  }
  window.__MQ4K_INITIALIZED__ = true;

  const DEFAULT_CONFIG = {
    enabled: true,
    targetQuality: 'hd2160',
    blockAV1: true,
    blockHDR60: true,
    block60fps: false,
    stabilizeBuffer: true,
    disableAmbientMode: true,
    smartDropGuard: true,
    telemetrySync: false
  };

  const state = {
    config: Object.assign({}, DEFAULT_CONFIG),
    activeMimeTypes: {
      video: 'unknown',
      audio: 'unknown'
    },
    stats: {
      blockedCodecChecks: 0,
      microGapsRecovered: 0,
      qualityEnforcements: 0,
      appendedVideoChunks: 0,
      appendedVideoBytes: 0,
      lastQualityLocked: 'auto',
      lastStallTimestamp: 0
    },
    lastVideoId: null,
    qualityAppliedForVideo: null,
    dropGuardTriggered: false
  };

  const QUALITY_RANK = [
    'highres',
    'hd2880',
    'hd2160',
    'hd1440',
    'hd1080',
    'hd720',
    'large',
    'medium',
    'small',
    'tiny'
  ];

  /**
   * Determines whether a given MIME type string should be blocked based on active hardware profile.
   * @param {string} mimeType
   * @returns {boolean}
   */
  function shouldBlockMimeType(mimeType) {
    if (!state.config.enabled || !mimeType || typeof mimeType !== 'string') {
      return false;
    }

    const normalized = mimeType.toLowerCase();

    // Block AV1 (av01) to avoid 100% software CPU decoding on GPUs without AV1 hardware blocks
    if (state.config.blockAV1 && normalized.includes('av01')) {
      state.stats.blockedCodecChecks += 1;
      return true;
    }

    // Block VP9 Profile 2 / 10-bit HDR (vp09.02) which causes heavy shader/tonemapping load on budget GPUs
    if (state.config.blockHDR60 && (normalized.includes('vp09.02') || normalized.includes('vp9.2'))) {
      state.stats.blockedCodecChecks += 1;
      return true;
    }

    // Block high framerate (>30fps) streams when 60fps limiter is enabled to halve GPU/CPU decode load per second
    if (state.config.block60fps) {
      const fpsMatch = normalized.match(/framerate=(\d+)/);
      if (fpsMatch && Number(fpsMatch[1]) > 30) {
        state.stats.blockedCodecChecks += 1;
        return true;
      }
    }

    return false;
  }

  /**
   * 1. Hook MediaSource.isTypeSupported and HTMLMediaElement.prototype.canPlayType
   */
  function installCodecHooks() {
    if (typeof window.MediaSource !== 'undefined' && typeof window.MediaSource.isTypeSupported === 'function') {
      const originalIsTypeSupported = window.MediaSource.isTypeSupported.bind(window.MediaSource);

      window.MediaSource.isTypeSupported = function (mimeType) {
        if (shouldBlockMimeType(mimeType)) {
          return false;
        }
        return originalIsTypeSupported(mimeType);
      };
    }

    if (typeof window.HTMLMediaElement !== 'undefined' && window.HTMLMediaElement.prototype) {
      const originalCanPlayType = window.HTMLMediaElement.prototype.canPlayType;

      window.HTMLMediaElement.prototype.canPlayType = function (mimeType) {
        if (shouldBlockMimeType(mimeType)) {
          return '';
        }
        return originalCanPlayType.call(this, mimeType);
      };
    }
  }

  /**
   * 2. Hook MediaSource.prototype.addSourceBuffer to monitor MSE buffer health & chunk appends
   */
  function installMSEBufferHooks() {
    if (typeof window.MediaSource === 'undefined' || !window.MediaSource.prototype) {
      return;
    }

    const originalAddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;

    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
      const sourceBuffer = originalAddSourceBuffer.call(this, mimeType);

      try {
        if (typeof mimeType === 'string') {
          if (mimeType.toLowerCase().includes('video')) {
            state.activeMimeTypes.video = mimeType;
          } else if (mimeType.toLowerCase().includes('audio')) {
            state.activeMimeTypes.audio = mimeType;
          }
        }

        if (sourceBuffer && typeof sourceBuffer.appendBuffer === 'function') {
          const originalAppendBuffer = sourceBuffer.appendBuffer;
          const isVideoBuffer = typeof mimeType === 'string' && mimeType.toLowerCase().includes('video');

          sourceBuffer.appendBuffer = function (data) {
            if (isVideoBuffer && data) {
              state.stats.appendedVideoChunks += 1;
              state.stats.appendedVideoBytes += data.byteLength || 0;
            }
            return originalAppendBuffer.call(this, data);
          };
        }
      } catch (err) {
        // Fail silently to never break native playback
      }

      return sourceBuffer;
    };
  }

  /**
   * 3. Calculate buffered time ahead of current playback position
   * @param {HTMLVideoElement} video
   * @returns {{ bufferAhead: number, nextGapStart: number | null }}
   */
  function analyzeVideoBuffer(video) {
    if (!video || !video.buffered || video.buffered.length === 0) {
      return { bufferAhead: 0, nextGapStart: null };
    }

    const currentTime = video.currentTime;
    const ranges = video.buffered;
    let bufferAhead = 0;
    let nextGapStart = null;

    for (let i = 0; i < ranges.length; i += 1) {
      const start = ranges.start(i);
      const end = ranges.end(i);

      if (currentTime >= start - 0.15 && currentTime <= end + 0.05) {
        bufferAhead = Math.max(0, end - currentTime);
        if (i + 1 < ranges.length) {
          const nextStart = ranges.start(i + 1);
          if (nextStart - end > 0 && nextStart - end < 1.2) {
            nextGapStart = nextStart;
          }
        }
        break;
      } else if (start > currentTime && start - currentTime < 0.85) {
        nextGapStart = start;
        break;
      }
    }

    return { bufferAhead, nextGapStart };
  }

  /**
   * 4. Recover from MSE Micro-Gaps (prevents infinite buffering spinner when segments have tiny timestamp gaps)
   * @param {HTMLVideoElement} video
   * @param {{ bufferAhead: number, nextGapStart: number | null }} bufferInfo
   */
  function recoverFromMicroGap(video, bufferInfo) {
    if (!state.config.enabled || !state.config.stabilizeBuffer || !video) {
      return;
    }

    const isStalled = !video.paused && !video.ended && video.readyState < 3;
    if (isStalled && bufferInfo.nextGapStart !== null) {
      const now = Date.now();
      if (now - state.stats.lastStallTimestamp > 1500) {
        video.currentTime = bufferInfo.nextGapStart + 0.02;
        state.stats.microGapsRecovered += 1;
        state.stats.lastStallTimestamp = now;
      }
    }
  }

  /**
   * 5. Enforce Target Quality on YouTube's internal #movie_player API
   */
  function enforcePlayerQuality(player, forceApply) {
    if (!state.config.enabled || !player || state.config.targetQuality === 'auto') {
      return;
    }

    try {
      if (typeof player.getAvailableQualityLevels !== 'function') {
        return;
      }

      const available = player.getAvailableQualityLevels();
      if (!Array.isArray(available) || available.length === 0) {
        return;
      }

      let desiredQuality = state.config.targetQuality;
      if (state.dropGuardTriggered && desiredQuality === 'hd2160' && available.includes('hd1440')) {
        desiredQuality = 'hd1440';
      }

      // Find best matching quality at or below desired rank if exact match is unavailable
      let chosenQuality = null;
      if (available.includes(desiredQuality)) {
        chosenQuality = desiredQuality;
      } else {
        const desiredIdx = QUALITY_RANK.indexOf(desiredQuality);
        for (let i = Math.max(0, desiredIdx); i < QUALITY_RANK.length; i += 1) {
          if (available.includes(QUALITY_RANK[i])) {
            chosenQuality = QUALITY_RANK[i];
            break;
          }
        }
        if (!chosenQuality) {
          chosenQuality = available[0];
        }
      }

      const currentQuality = typeof player.getPlaybackQuality === 'function'
        ? player.getPlaybackQuality()
        : null;

      if (forceApply || currentQuality !== chosenQuality) {
        if (typeof player.setPlaybackQualityRange === 'function') {
          player.setPlaybackQualityRange(chosenQuality, chosenQuality);
        }
        if (typeof player.setPlaybackQuality === 'function') {
          player.setPlaybackQuality(chosenQuality);
        }
        state.stats.qualityEnforcements += 1;
        state.stats.lastQualityLocked = chosenQuality;
      }
    } catch (err) {
      // Ignore transient player API errors
    }
  }

  /**
   * 6. Disable YouTube's GPU-heavy Ambient Mode (Cinematic Lighting) when configured
   */
  function optimizePlayerDOM() {
    const root = document.documentElement;
    if (root) {
      if (state.config.enabled && state.config.disableAmbientMode) {
        root.setAttribute('data-mq4k-ambient-off', 'true');
      } else {
        root.removeAttribute('data-mq4k-ambient-off');
      }
    }
  }

  /**
   * 7. Periodic Monitor Loop: Evaluates player state, buffer health, frame drops, and dispatches metrics
   */
  function runMonitorCycle() {
    const player = document.getElementById('movie_player');
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

    optimizePlayerDOM();

    if (video && state.config.enabled) {
      if (video.preload !== 'auto') {
        video.preload = 'auto';
      }
    }

    let currentVideoId = null;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      currentVideoId = urlParams.get('v');
    } catch (e) {
      currentVideoId = null;
    }

    if (currentVideoId && currentVideoId !== state.lastVideoId) {
      state.lastVideoId = currentVideoId;
      state.qualityAppliedForVideo = null;
      state.dropGuardTriggered = false;
    }

    const bufferInfo = analyzeVideoBuffer(video);
    recoverFromMicroGap(video, bufferInfo);

    // Evaluate frame drop rate for Smart Drop Guard
    let totalFrames = 0;
    let droppedFrames = 0;
    let dropRatePercent = 0;

    if (video && typeof video.getVideoPlaybackQuality === 'function') {
      const qualityStats = video.getVideoPlaybackQuality();
      totalFrames = qualityStats.totalVideoFrames || 0;
      droppedFrames = qualityStats.droppedVideoFrames || 0;
      if (totalFrames > 60) {
        dropRatePercent = Number(((droppedFrames / totalFrames) * 100).toFixed(2));
      }
    }

    if (
      state.config.enabled &&
      state.config.smartDropGuard &&
      totalFrames > 300 &&
      dropRatePercent > 18.0 &&
      !state.dropGuardTriggered
    ) {
      state.dropGuardTriggered = true;
      enforcePlayerQuality(player, true);
    }

    if (player && state.config.enabled) {
      const shouldForce = state.qualityAppliedForVideo !== currentVideoId;
      enforcePlayerQuality(player, shouldForce);
      if (currentVideoId) {
        state.qualityAppliedForVideo = currentVideoId;
      }
    }

    // Collect telemetry snapshot for Popup and Background Service Worker
    let currentQuality = 'auto';
    let availableQualities = [];
    if (player) {
      try {
        if (typeof player.getPlaybackQuality === 'function') {
          currentQuality = player.getPlaybackQuality() || 'auto';
        }
        if (typeof player.getAvailableQualityLevels === 'function') {
          availableQualities = player.getAvailableQualityLevels() || [];
        }
      } catch (e) {
        // Ignore
      }
    }

    const resolution = video && video.videoWidth && video.videoHeight
      ? `${video.videoWidth}x${video.videoHeight}`
      : 'N/A';

    const payload = {
      timestamp: Date.now(),
      videoId: currentVideoId,
      currentQuality,
      targetQuality: state.config.targetQuality,
      availableQualities,
      resolution,
      bufferAheadSec: Number(bufferInfo.bufferAhead.toFixed(2)),
      totalFrames,
      droppedFrames,
      dropRatePercent,
      videoMimeType: state.activeMimeTypes.video,
      audioMimeType: state.activeMimeTypes.audio,
      blockedCodecChecks: state.stats.blockedCodecChecks,
      microGapsRecovered: state.stats.microGapsRecovered,
      qualityEnforcements: state.stats.qualityEnforcements,
      appendedVideoChunks: state.stats.appendedVideoChunks,
      appendedVideoMB: Number((state.stats.appendedVideoBytes / (1024 * 1024)).toFixed(2)),
      dropGuardActive: state.dropGuardTriggered
    };

    window.dispatchEvent(new CustomEvent('MQ4K_PLAYER_METRICS', { detail: payload }));
  }

  // Listen for configuration updates from the ISOLATED world content-controller
  window.addEventListener('MQ4K_CONFIG_SYNC', function (event) {
    if (event && event.detail && typeof event.detail === 'object') {
      const prevTarget = state.config.targetQuality;
      state.config = Object.assign({}, DEFAULT_CONFIG, event.detail);
      optimizePlayerDOM();

      if (prevTarget !== state.config.targetQuality) {
        state.dropGuardTriggered = false;
        const player = document.getElementById('movie_player');
        enforcePlayerQuality(player, true);
      }
    }
  });

  // Listen for manual quality enforcement requests from Popup
  window.addEventListener('MQ4K_FORCE_QUALITY_NOW', function () {
    const player = document.getElementById('movie_player');
    state.dropGuardTriggered = false;
    enforcePlayerQuality(player, true);
    runMonitorCycle();
  });

  installCodecHooks();
  installMSEBufferHooks();

  // Hook YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', function () {
    setTimeout(runMonitorCycle, 350);
  });

  setInterval(runMonitorCycle, 1000);
})();
