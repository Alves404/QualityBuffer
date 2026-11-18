/**
 * QualityBuffer v2.3.0 - YouTube Playback Stability & Hardware Codec Engine (MAIN World)
 *
 * Conceived and architected by Joao Vitor Magalhaes Alves (@Alves404).
 * AI tools acted exclusively as development and code review assistants under human direction.
 *
 * Executes in the main page context on YouTube watch pages using strictly non-destructive,
 * Terms-of-Service-compliant browser and player APIs:
 * 1. Non-Destructive MediaCapabilities Hinting:
 *    Preserves native codec support (never returning supported: false) while adjusting
 *    smooth/powerEfficient hints so YouTube naturally prefers GPU hardware VP9 SDR and 30fps
 *    without ever failing on AV1-only videos, HDR streams, Shorts, or Ads.
 * 2. Ad-Safe Official Player Quality Control (#movie_player API):
 *    Applies the user's preferred resolution once per video after metadata loads, never
 *    interfering with active advertisements, error screens, or manual gear-menu changes.
 * 3. Passive PerformanceObserver CDN Preconnect:
 *    Observes media resource timings passively without hooking fetch/XHR or blocking beacons.
 * 4. Adaptive Frame-Drop & Rebuffer Guard + Conservative MSE Micro-Gap Recovery:
 *    Monitors real playback health and steps down gracefully if hardware or network stalls occur.
 *
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
    stabilityProfile: 'balanced',
    targetBufferSec: 120,
    deepPreBuffer: true,
    parallelPrefetch: true,
    headstartBoost: false,
    blockAV1: true,
    blockHDR60: true,
    block60fps: false,
    stabilizeBuffer: true,
    disableAmbientMode: true,
    smartDropGuard: true
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

  const QUALITY_NUMERIC_MAP = {
    highres: 4320,
    hd2880: 2880,
    hd2160: 2160,
    hd1440: 1440,
    hd1080: 1080,
    hd720: 720,
    large: 480,
    medium: 360,
    small: 240,
    tiny: 144
  };

  const MAX_PRECONNECT_ORIGINS = 6;

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
      prefetchedChunks: 0,
      lastQualityLocked: 'auto',
      lastStallTimestamp: 0
    },
    lastVideoId: null,
    qualityAppliedForVideo: null,
    effectiveQuality: null,
    userManualQualityOverride: false,
    lastExtensionQualitySetAt: 0,
    dropGuardTriggered: false,
    lastDropGuardStepAt: 0,
    realBufferAheadSec: 0,
    playbackErrorDetected: false,
    stallTimestamps: [],
    stallFreezeStartedAt: 0,
    lastObservedCurrentTime: -1,
    baselineTotalFrames: 0,
    baselineDroppedFrames: 0,
    preconnectedOrigins: new Set(),
    boundPlayers: new WeakSet(),
    boundVideos: new WeakSet()
  };

  /**
   * Returns stability thresholds based on the selected Stability Profile
   * @returns {{ maxDropPercent: number, minSampleFrames: number, maxStallsInWindow: number, stallWindowMs: number }}
   */
  function getProfileThresholds() {
    const profile = state.config.stabilityProfile || 'balanced';
    if (profile === 'strict_quality') {
      return {
        maxDropPercent: 22.0,
        minSampleFrames: 240,
        maxStallsInWindow: 4,
        stallWindowMs: 30000
      };
    }
    if (profile === 'gpu_saver') {
      return {
        maxDropPercent: 10.0,
        minSampleFrames: 120,
        maxStallsInWindow: 2,
        stallWindowMs: 20000
      };
    }
    return {
      maxDropPercent: 15.0,
      minSampleFrames: 180,
      maxStallsInWindow: 3,
      stallWindowMs: 25000
    };
  }

  /**
   * Seeds YouTube's standard local/session quality preference key cleanly
   * @param {string} targetQuality
   */
  function seedYouTubeQualityStorage(targetQuality) {
    if (!state.config.enabled || !targetQuality || targetQuality === 'auto') {
      return;
    }

    const resNum = QUALITY_NUMERIC_MAP[targetQuality] || 2160;
    const now = Date.now();
    const qualityPayload = JSON.stringify({
      data: JSON.stringify({
        quality: resNum,
        previousQuality: resNum
      }),
      expiration: now + 31536000000,
      creation: now
    });

    try {
      window.localStorage.setItem('yt-player-quality', qualityPayload);
      window.sessionStorage.setItem('yt-player-quality', qualityPayload);
    } catch (err) {
      // Ignore storage quota or privacy sandbox restrictions
    }
  }

  /**
   * Evaluates whether a video configuration should be marked non-powerEfficient / non-smooth
   * in MediaCapabilities so YouTube prefers hardware VP9 SDR / 30fps without breaking playback.
   * @param {string} contentType
   * @param {number} explicitFramerate
   * @param {string} transferFunction
   * @returns {boolean}
   */
  function shouldDeprioritizeCodec(contentType, explicitFramerate, transferFunction) {
    if (!state.config.enabled || !contentType || typeof contentType !== 'string') {
      return false;
    }

    const normalized = contentType.toLowerCase();
    const tf = (transferFunction || '').toLowerCase();

    // Prefer Hardware VP9 over AV1 (deprioritizes av01 without blocking AV1-only videos)
    if (state.config.blockAV1 && normalized.includes('av01')) {
      state.stats.blockedCodecChecks += 1;
      return true;
    }

    // Prefer 8-bit SDR over 10-bit HDR (vp09.02 / PQ / HLG)
    if (
      state.config.blockHDR60 &&
      (normalized.includes('vp09.02') ||
        normalized.includes('vp9.2') ||
        tf === 'pq' ||
        tf === 'hlg')
    ) {
      state.stats.blockedCodecChecks += 1;
      return true;
    }

    // Prefer <=30fps streams when 30fps limiter or GPU Saver profile is active
    const limit30Fps =
      Boolean(state.config.block60fps) || state.config.stabilityProfile === 'gpu_saver';
    if (limit30Fps) {
      if (typeof explicitFramerate === 'number' && explicitFramerate > 32) {
        state.stats.blockedCodecChecks += 1;
        return true;
      }
      const fpsMatch = normalized.match(/framerate=(\d+)/);
      if (fpsMatch && Number(fpsMatch[1]) > 32) {
        state.stats.blockedCodecChecks += 1;
        return true;
      }
    }

    return false;
  }

  /**
   * PILAR 1: Non-Destructive MediaCapabilities Hinting.
   * Leaves MediaSource.isTypeSupported and canPlayType 100% native so no stream ever fails
   * with "Playback Error", while guiding YouTube's ABR selector via smooth/powerEfficient flags.
   */
  function installSafeCodecHints() {
    if (
      typeof window.MediaCapabilities === 'undefined' ||
      !window.MediaCapabilities.prototype ||
      typeof window.MediaCapabilities.prototype.decodingInfo !== 'function'
    ) {
      return;
    }

    const originalDecodingInfo = window.MediaCapabilities.prototype.decodingInfo;

    window.MediaCapabilities.prototype.decodingInfo = function (configuration) {
      const nativePromise = originalDecodingInfo.apply(this, arguments);

      if (!state.config.enabled || !configuration || !configuration.video) {
        return nativePromise;
      }

      return nativePromise
        .then(function (info) {
          if (!info || !info.supported) {
            return info;
          }

          const videoCfg = configuration.video || {};
          const contentType = String(videoCfg.contentType || '');
          const framerate = Number(videoCfg.framerate) || 0;
          const transferFunction = String(videoCfg.transferFunction || '');

          if (shouldDeprioritizeCodec(contentType, framerate, transferFunction)) {
            return Object.assign({}, info, {
              supported: true,
              smooth: false,
              powerEfficient: false
            });
          }

          const lower = contentType.toLowerCase();
          if (lower.includes('vp09.00') || lower.includes('avc1')) {
            return Object.assign({}, info, {
              supported: true,
              smooth: true,
              powerEfficient: true
            });
          }

          return info;
        })
        .catch(function () {
          return nativePromise;
        });
    };
  }

  /**
   * Passive read-only listener on MediaSource.prototype.addSourceBuffer strictly
   * to record active video/audio codec strings for the Popup UI without touching appendBuffer.
   */
  function installPassiveMimeInspector() {
    if (typeof window.MediaSource === 'undefined' || !window.MediaSource.prototype) {
      return;
    }

    const originalAddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;
    if (typeof originalAddSourceBuffer !== 'function') {
      return;
    }

    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
      const sourceBuffer = originalAddSourceBuffer.apply(this, arguments);
      try {
        if (typeof mimeType === 'string') {
          const lower = mimeType.toLowerCase();
          if (lower.includes('video')) {
            state.activeMimeTypes.video = mimeType;
          } else if (lower.includes('audio')) {
            state.activeMimeTypes.audio = mimeType;
          }
        }
      } catch (e) {
        // Never interfere with SourceBuffer creation
      }
      return sourceBuffer;
    };
  }

  /**
   * Injects <link rel="dns-prefetch"> and <link rel="preconnect"> for active media CDN origins
   * discovered passively via PerformanceObserver (capped to avoid DOM bloat).
   * @param {string} origin
   */
  function ensureCdnPreconnect(origin) {
    if (
      !origin ||
      state.preconnectedOrigins.has(origin) ||
      state.preconnectedOrigins.size >= MAX_PRECONNECT_ORIGINS ||
      !document.head
    ) {
      return;
    }
    state.preconnectedOrigins.add(origin);
    try {
      const dnsLink = document.createElement('link');
      dnsLink.rel = 'dns-prefetch';
      dnsLink.href = origin;
      document.head.appendChild(dnsLink);

      const preconnectLink = document.createElement('link');
      preconnectLink.rel = 'preconnect';
      preconnectLink.href = origin;
      preconnectLink.crossOrigin = 'anonymous';
      document.head.appendChild(preconnectLink);

      state.stats.prefetchedChunks += 1;
    } catch (e) {
      // Ignore DOM errors
    }
  }

  /**
   * PILAR 2: Passive PerformanceObserver for CDN Origin Warm-up.
   * Zero overrides on window.fetch, XMLHttpRequest, or navigator.sendBeacon.
   */
  function installPassivePerformanceObserver() {
    if (typeof window.PerformanceObserver !== 'function') {
      return;
    }

    try {
      const observer = new PerformanceObserver(function (list) {
        if (!state.config.enabled || !state.config.parallelPrefetch) {
          return;
        }
        const entries = list.getEntries();
        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i];
          if (entry && typeof entry.name === 'string' && entry.name.includes('.googlevideo.com/')) {
            try {
              const origin = new URL(entry.name).origin;
              ensureCdnPreconnect(origin);
            } catch (e) {
              // Ignore malformed URLs
            }
          }
        }
      });

      observer.observe({ type: 'resource', buffered: true });
    } catch (e) {
      // Ignore if resource observer is unsupported
    }
  }

  /**
   * Checks whether the player is currently displaying or transitioning through an advertisement.
   * @param {HTMLElement | null} player
   * @returns {boolean}
   */
  function isAdPlaying(player) {
    if (!player) {
      return false;
    }
    try {
      if (
        player.classList.contains('ad-showing') ||
        player.classList.contains('ad-interrupting')
      ) {
        return true;
      }
      if (typeof player.getAdState === 'function' && player.getAdState() === 1) {
        return true;
      }
      if (player.querySelector('.ytp-ad-player-overlay, .ytp-ad-preview-container')) {
        return true;
      }
    } catch (e) {
      // Ignore
    }
    return false;
  }

  /**
   * Checks whether the player or video element is in an error state.
   * @param {HTMLElement | null} player
   * @param {HTMLVideoElement | null} video
   * @returns {boolean}
   */
  function hasPlaybackError(player, video) {
    try {
      if (video && video.error) {
        return true;
      }
      if (player && player.classList.contains('ytp-error')) {
        return true;
      }
      const errDisplay = player ? player.querySelector('.ytp-error') : null;
      if (errDisplay && errDisplay.offsetParent !== null) {
        return true;
      }
    } catch (e) {
      // Ignore
    }
    return false;
  }

  /**
   * Verifies that the player is a primary watch/live player, not an inline hover preview or Shorts player,
   * and is not currently playing an ad or showing an error.
   * @param {HTMLElement | null} player
   * @param {HTMLVideoElement | null} video
   * @returns {boolean}
   */
  function isSafeWatchPlayer(player, video) {
    if (!player || !video) {
      return false;
    }
    const path = window.location.pathname || '';
    if (path.startsWith('/shorts')) {
      return false;
    }
    try {
      if (
        player.closest(
          'ytd-video-preview, ytd-reel-video-renderer, #shorts-player, ytd-miniplayer, ytd-inline-preview-player'
        )
      ) {
        return false;
      }
    } catch (e) {
      // Ignore
    }
    if (isAdPlaying(player) || hasPlaybackError(player, video)) {
      return false;
    }
    return true;
  }

  /**
   * Calculates real buffered time ahead of current playback position
   * @param {HTMLVideoElement | null} video
   * @returns {{ bufferAhead: number, nextGapStart: number | null, nextRangeDuration: number }}
   */
  function analyzeVideoBuffer(video) {
    if (!video || !video.buffered || video.buffered.length === 0) {
      return { bufferAhead: 0, nextGapStart: null, nextRangeDuration: 0 };
    }

    const ranges = video.buffered;
    const currentTime = video.currentTime;
    let bufferAhead = 0;
    let nextGapStart = null;
    let nextRangeDuration = 0;

    for (let i = 0; i < ranges.length; i += 1) {
      const start = ranges.start(i);
      const end = ranges.end(i);

      if (currentTime >= start - 0.25 && currentTime <= end + 0.05) {
        bufferAhead = Math.max(0, end - currentTime);
        if (i + 1 < ranges.length) {
          const nextStart = ranges.start(i + 1);
          const nextEnd = ranges.end(i + 1);
          if (nextStart - end > 0.02 && nextStart - end < 1.2) {
            nextGapStart = nextStart;
            nextRangeDuration = Math.max(0, nextEnd - nextStart);
          }
        }
        break;
      } else if (start > currentTime && start - currentTime >= 0.03 && start - currentTime < 1.1) {
        nextGapStart = start;
        nextRangeDuration = Math.max(0, end - start);
        break;
      }
    }

    return { bufferAhead, nextGapStart, nextRangeDuration };
  }

  /**
   * Conservative MSE Micro-Gap Recovery:
   * Only nudges playhead if playback has been genuinely frozen at the exact same timestamp
   * for >= 2.6 seconds outside ads/seeking and a valid forward buffered segment exists.
   * @param {HTMLElement | null} player
   * @param {HTMLVideoElement | null} video
   * @param {{ bufferAhead: number, nextGapStart: number | null, nextRangeDuration: number }} bufferInfo
   */
  function recoverFromMicroGap(player, video, bufferInfo) {
    if (
      !state.config.enabled ||
      !state.config.stabilizeBuffer ||
      !isSafeWatchPlayer(player, video)
    ) {
      state.stallFreezeStartedAt = 0;
      return;
    }

    if (video.paused || video.ended || video.seeking || video.readyState >= 3) {
      state.stallFreezeStartedAt = 0;
      state.lastObservedCurrentTime = video.currentTime;
      return;
    }

    const now = Date.now();
    const curTime = video.currentTime;

    if (Math.abs(curTime - state.lastObservedCurrentTime) < 0.01) {
      if (state.stallFreezeStartedAt === 0) {
        state.stallFreezeStartedAt = now;
      }
    } else {
      state.stallFreezeStartedAt = 0;
      state.lastObservedCurrentTime = curTime;
      return;
    }

    const frozenDurationMs = now - state.stallFreezeStartedAt;
    if (
      frozenDurationMs >= 2600 &&
      bufferInfo.nextGapStart !== null &&
      bufferInfo.nextRangeDuration >= 1.5 &&
      now - state.stats.lastStallTimestamp > 6000
    ) {
      try {
        video.currentTime = bufferInfo.nextGapStart + 0.04;
        state.stats.microGapsRecovered += 1;
        state.stats.lastStallTimestamp = now;
        state.stallFreezeStartedAt = 0;
      } catch (e) {
        // Ignore seek exceptions
      }
    }
  }

  /**
   * Applies target resolution via YouTube's official #movie_player API safely and once per video.
   * @param {HTMLElement | null} player
   * @param {HTMLVideoElement | null} video
   * @param {boolean} forceApply
   * @returns {boolean}
   */
  function enforcePlayerQuality(player, video, forceApply) {
    if (
      !state.config.enabled ||
      !isSafeWatchPlayer(player, video) ||
      state.config.targetQuality === 'auto'
    ) {
      return false;
    }

    if (!forceApply && state.userManualQualityOverride) {
      return false;
    }

    if (video.readyState < 1) {
      return false;
    }

    try {
      if (typeof player.getAvailableQualityLevels !== 'function') {
        return false;
      }

      const available = player.getAvailableQualityLevels();
      if (!Array.isArray(available) || available.length === 0) {
        return false;
      }

      const desiredQuality = state.effectiveQuality || state.config.targetQuality;
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

      if (!chosenQuality || chosenQuality === 'auto') {
        return false;
      }

      const currentQuality =
        typeof player.getPlaybackQuality === 'function' ? player.getPlaybackQuality() : null;

      if (forceApply || currentQuality !== chosenQuality) {
        state.lastExtensionQualitySetAt = Date.now();
        if (typeof player.setPlaybackQualityRange === 'function') {
          player.setPlaybackQualityRange(chosenQuality, chosenQuality);
        }
        if (typeof player.setPlaybackQuality === 'function') {
          player.setPlaybackQuality(chosenQuality);
        }
        state.stats.qualityEnforcements += 1;
        state.stats.lastQualityLocked = chosenQuality;
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Steps down target resolution by one tier when hardware frame drops or repeated network
   * stalls exceed the active Stability Profile thresholds.
   * @param {HTMLElement | null} player
   * @param {HTMLVideoElement | null} video
   * @param {number} windowFrames
   * @param {number} windowDropPercent
   */
  function evaluateStabilityGuard(player, video, windowFrames, windowDropPercent) {
    if (
      !state.config.enabled ||
      !state.config.smartDropGuard ||
      !isSafeWatchPlayer(player, video)
    ) {
      return;
    }

    const now = Date.now();
    if (now - state.lastDropGuardStepAt < 12000) {
      return;
    }

    const thresholds = getProfileThresholds();

    // Prune old stall events outside the profile window
    while (
      state.stallTimestamps.length > 0 &&
      now - state.stallTimestamps[0] > thresholds.stallWindowMs
    ) {
      state.stallTimestamps.shift();
    }

    const severeFrameDrops =
      windowFrames >= thresholds.minSampleFrames &&
      windowDropPercent > thresholds.maxDropPercent;
    const repeatedRebufferStalls =
      state.stallTimestamps.length >= thresholds.maxStallsInWindow;

    if (!severeFrameDrops && !repeatedRebufferStalls) {
      return;
    }

    let currentQuality =
      typeof player.getPlaybackQuality === 'function' ? player.getPlaybackQuality() : null;
    if (!currentQuality || currentQuality === 'auto') {
      currentQuality = state.effectiveQuality || state.config.targetQuality;
    }

    const currentIdx = QUALITY_RANK.indexOf(currentQuality);
    const hd720Idx = QUALITY_RANK.indexOf('hd720');
    if (currentIdx === -1 || currentIdx >= hd720Idx) {
      return;
    }

    const nextLowerQuality = QUALITY_RANK[currentIdx + 1];
    state.effectiveQuality = nextLowerQuality;
    state.dropGuardTriggered = true;
    state.lastDropGuardStepAt = now;
    state.stallTimestamps.length = 0;

    if (video && typeof video.getVideoPlaybackQuality === 'function') {
      const qStats = video.getVideoPlaybackQuality();
      state.baselineTotalFrames = qStats.totalVideoFrames || 0;
      state.baselineDroppedFrames = qStats.droppedVideoFrames || 0;
    }

    enforcePlayerQuality(player, video, true);
  }

  /**
   * Binds non-intrusive event listeners to #movie_player and <video> to detect
   * manual user quality switches and genuine rebuffer waiting events.
   * @param {HTMLElement | null} player
   * @param {HTMLVideoElement | null} video
   */
  function bindPlayerAndVideoListeners(player, video) {
    if (player && !state.boundPlayers.has(player)) {
      try {
        if (typeof player.addEventListener === 'function') {
          player.addEventListener('onPlaybackQualityChange', function () {
            const elapsed = Date.now() - state.lastExtensionQualitySetAt;
            if (elapsed > 1800 && state.qualityAppliedForVideo === state.lastVideoId) {
              state.userManualQualityOverride = true;
            }
          });
          state.boundPlayers.add(player);
        }
      } catch (e) {
        // Ignore
      }
    }

    if (video && !state.boundVideos.has(video)) {
      try {
        video.addEventListener(
          'waiting',
          function () {
            if (
              state.config.enabled &&
              !video.paused &&
              !video.seeking &&
              video.currentTime > 2.0 &&
              isSafeWatchPlayer(player, video)
            ) {
              state.stallTimestamps.push(Date.now());
            }
          },
          { passive: true }
        );
        state.boundVideos.add(video);
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Toggles CSS Ambient Mode / GPU Blur saver attribute on documentElement
   */
  function optimizePlayerDOM() {
    const root = document.documentElement;
    if (root) {
      const shouldDisableAmbient =
        state.config.enabled &&
        (state.config.disableAmbientMode || state.config.stabilityProfile === 'gpu_saver');
      if (shouldDisableAmbient) {
        root.setAttribute('data-mq4k-ambient-off', 'true');
      } else {
        root.removeAttribute('data-mq4k-ambient-off');
      }
    }
  }

  /**
   * Periodic Monitor Cycle: Evaluates watch state, buffer health, frame drop guard,
   * and dispatches read-only telemetry to the Popup UI.
   */
  function runMonitorCycle() {
    const player = document.getElementById('movie_player');
    const video =
      (player && player.querySelector('video.html5-main-video')) ||
      document.querySelector('video.html5-main-video') ||
      document.querySelector('video');

    optimizePlayerDOM();
    bindPlayerAndVideoListeners(player, video);

    state.playbackErrorDetected = hasPlaybackError(player, video);

    if (video && state.config.enabled && !state.playbackErrorDetected) {
      if (video.preload !== 'auto') {
        video.preload = 'auto';
      }
    }

    let currentVideoId = null;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      currentVideoId = urlParams.get('v');
      if (!currentVideoId && player && typeof player.getVideoData === 'function') {
        const vd = player.getVideoData();
        if (vd && vd.video_id) {
          currentVideoId = vd.video_id;
        }
      }
    } catch (e) {
      currentVideoId = null;
    }

    if (currentVideoId && currentVideoId !== state.lastVideoId) {
      state.lastVideoId = currentVideoId;
      state.qualityAppliedForVideo = null;
      state.effectiveQuality = state.config.targetQuality;
      state.userManualQualityOverride = false;
      state.dropGuardTriggered = false;
      state.stallTimestamps.length = 0;
      state.stallFreezeStartedAt = 0;
      state.baselineTotalFrames = 0;
      state.baselineDroppedFrames = 0;
      seedYouTubeQualityStorage(state.config.targetQuality);
    }

    const bufferInfo = analyzeVideoBuffer(video);
    state.realBufferAheadSec = bufferInfo.bufferAhead;

    recoverFromMicroGap(player, video, bufferInfo);

    // Compute total and window frame drop rates
    let totalFrames = 0;
    let droppedFrames = 0;
    let dropRatePercent = 0;
    let windowFrames = 0;
    let windowDropPercent = 0;

    if (video && typeof video.getVideoPlaybackQuality === 'function') {
      const qualityStats = video.getVideoPlaybackQuality();
      totalFrames = qualityStats.totalVideoFrames || 0;
      droppedFrames = qualityStats.droppedVideoFrames || 0;
      if (totalFrames > 30) {
        dropRatePercent = Number(((droppedFrames / totalFrames) * 100).toFixed(2));
      }
      if (totalFrames < state.baselineTotalFrames) {
        state.baselineTotalFrames = 0;
        state.baselineDroppedFrames = 0;
      }
      windowFrames = Math.max(0, totalFrames - state.baselineTotalFrames);
      const windowDropped = Math.max(0, droppedFrames - state.baselineDroppedFrames);
      if (windowFrames > 30) {
        windowDropPercent = Number(((windowDropped / windowFrames) * 100).toFixed(2));
      }
    }

    evaluateStabilityGuard(player, video, windowFrames, windowDropPercent);

    if (
      player &&
      video &&
      state.config.enabled &&
      currentVideoId &&
      state.qualityAppliedForVideo !== currentVideoId &&
      isSafeWatchPlayer(player, video)
    ) {
      const applied = enforcePlayerQuality(player, video, true);
      if (applied) {
        state.qualityAppliedForVideo = currentVideoId;
      }
    }

    // Collect read-only telemetry snapshot for Popup and Background Service Worker
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

    const resolution =
      video && video.videoWidth && video.videoHeight
        ? `${video.videoWidth}x${video.videoHeight}`
        : 'N/A';

    const payload = {
      timestamp: Date.now(),
      videoId: currentVideoId,
      hasActiveVideo: Boolean(video && video.videoWidth > 0),
      isPaused: Boolean(!video || video.paused),
      playbackErrorDetected: state.playbackErrorDetected,
      currentQuality,
      targetQuality: state.config.targetQuality,
      effectiveQuality: state.effectiveQuality || state.config.targetQuality,
      stabilityProfile: state.config.stabilityProfile || 'balanced',
      availableQualities,
      resolution,
      bufferAheadSec: Number(bufferInfo.bufferAhead.toFixed(1)),
      totalFrames,
      droppedFrames,
      dropRatePercent,
      videoMimeType:
        state.activeMimeTypes.video && state.activeMimeTypes.video !== 'unknown'
          ? state.activeMimeTypes.video
          : 'vp09.00',
      audioMimeType:
        state.activeMimeTypes.audio && state.activeMimeTypes.audio !== 'unknown'
          ? state.activeMimeTypes.audio
          : 'opus',
      blockedCodecChecks: state.stats.blockedCodecChecks,
      microGapsRecovered: state.stats.microGapsRecovered,
      qualityEnforcements: state.stats.qualityEnforcements,
      prefetchedChunks: state.stats.prefetchedChunks,
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
      seedYouTubeQualityStorage(state.config.targetQuality);

      if (prevTarget !== state.config.targetQuality) {
        state.effectiveQuality = state.config.targetQuality;
        state.userManualQualityOverride = false;
        state.dropGuardTriggered = false;
        state.qualityAppliedForVideo = null;
        const player = document.getElementById('movie_player');
        const video =
          (player && player.querySelector('video.html5-main-video')) ||
          document.querySelector('video');
        if (enforcePlayerQuality(player, video, true) && state.lastVideoId) {
          state.qualityAppliedForVideo = state.lastVideoId;
        }
      }
    }
  });

  // Listen for manual quality & live configuration enforcement requests from Popup (zero seek / zero reload)
  window.addEventListener('MQ4K_FORCE_QUALITY_NOW', function (event) {
    const player = document.getElementById('movie_player');
    const video =
      (player && player.querySelector('video.html5-main-video')) ||
      document.querySelector('video.html5-main-video') ||
      document.querySelector('video');

    if (event && event.detail && typeof event.detail === 'object') {
      state.config = Object.assign({}, DEFAULT_CONFIG, event.detail);
    }

    state.effectiveQuality = state.config.targetQuality;
    state.userManualQualityOverride = false;
    state.dropGuardTriggered = false;
    state.qualityAppliedForVideo = null;

    optimizePlayerDOM();
    seedYouTubeQualityStorage(state.config.targetQuality);

    if (enforcePlayerQuality(player, video, true) && state.lastVideoId) {
      state.qualityAppliedForVideo = state.lastVideoId;
    }

    runMonitorCycle();
  });

  // Bootstrap safe v2.3.0 modules at document_start
  seedYouTubeQualityStorage(state.config.targetQuality);
  installSafeCodecHints();
  installPassiveMimeInspector();
  installPassivePerformanceObserver();

  // Hook YouTube SPA navigation events cleanly
  window.addEventListener('yt-navigate-finish', function () {
    seedYouTubeQualityStorage(state.config.targetQuality);
    setTimeout(runMonitorCycle, 200);
  });

  window.addEventListener('MQ4K_FORCE_MONITOR_CYCLE', function () {
    runMonitorCycle();
  });

  setInterval(runMonitorCycle, 800);
})();
