/**
 * My Quality 4k v2.0 - Deep Pre-Buffer & Zero-Track-Laying Engine (MAIN World)
 *
 * Executes in the main page context at document_start before YouTube initializes
 * its HTML5 player (#movie_player) and MediaSource Extensions (MSE).
 *
 * Core Engineering Pillars (v2.0):
 * 1. Hardware Codec & MediaCapabilities Acceleration (MediaSource + MediaCapabilities API):
 *    Blocks software-heavy AV1 (av01) and 10-bit HDR (vp09.02) across both MediaSource
 *    and navigator.mediaCapabilities.decodingInfo, while certifying VP9 Profile 0 (4K SDR)
 *    as { supported: true, smooth: true, powerEfficient: true } so YouTube unlocks
 *    maximum 4K buffer depth and large chunk sizes on low-to-mid-range GPUs.
 * 2. Deep Pre-Buffer Horizon (Safe HTMLMediaElement.buffered Horizon Control):
 *    Keeps SourceBuffer.prototype.buffered 100% native for MSE segment verification,
 *    while reporting a controlled lookahead horizon on HTMLMediaElement.prototype.buffered
 *    until the user's target buffer (60s / 120s / 180s) is reached.
 * 3. Zero-Track-Laying Bootstrap & CDN Preconnect:
 *    Spoofs navigator.connection (100 Mbps / 5ms RTT) so YouTube requests large multi-MB
 *    segments instead of tiny 256KB chunks, pre-seeds localStorage/sessionStorage
 *    yt-player-quality to 2160p before second zero, and pre-warms googlevideo.com CDN nodes.
 * 4. Main-Thread Telemetry Blocker & Compositor Optimization:
 *    Short-circuits heavy YouTube tracking beacons (/log_event, /api/stats/qoe, /ptracking)
 *    with valid JSON responses while preserving /api/stats/watchtime.
 *
 * Architecture & Planning: Claude Streaming Architect & Argon (Google Antigravity).
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
    targetBufferSec: 120,
    deepPreBuffer: true,
    parallelPrefetch: true,
    headstartBoost: false,
    blockAV1: true,
    blockHDR60: true,
    block60fps: false,
    stabilizeBuffer: true,
    disableAmbientMode: true,
    smartDropGuard: true,
    telemetrySync: false
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

  const VIRTUAL_BUFFER_HORIZON_SEC = 10.0;

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
      evictedBackBufferCount: 0,
      prefetchHits: 0,
      prefetchedChunks: 0,
      prefetchedBytes: 0,
      blockedTelemetryBeacons: 0,
      lastQualityLocked: 'auto',
      lastStallTimestamp: 0
    },
    lastVideoId: null,
    qualityAppliedForVideo: null,
    dropGuardTriggered: false,
    bufferGoalReached: false,
    mseQuotaWarning: false,
    mseQuotaWarningUntil: 0,
    realBufferAheadSec: 0,
    virtualBufferActive: false,
    preconnectedOrigins: new Set(),
    boundPlayers: new WeakSet(),
    headstartState: {
      videoId: null,
      active: false,
      startedAt: 0,
      completed: false,
      timerId: null
    }
  };

  // Capture native HTMLMediaElement.prototype.buffered descriptor before installing hooks
  const nativeVideoBufferedDesc =
    typeof window.HTMLMediaElement !== 'undefined' && window.HTMLMediaElement.prototype
      ? Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'buffered')
      : null;

  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  /**
   * Returns the real, unclamped TimeRanges of an HTMLMediaElement
   * @param {HTMLMediaElement} video
   * @returns {TimeRanges | null}
   */
  function getRealVideoBuffered(video) {
    if (!video) {
      return null;
    }
    try {
      if (nativeVideoBufferedDesc && typeof nativeVideoBufferedDesc.get === 'function') {
        return nativeVideoBufferedDesc.get.call(video);
      }
      return video.buffered;
    } catch (e) {
      return null;
    }
  }

  /**
   * PILAR 3.1: Spoof Network Information API (navigator.connection) so YouTube's
   * ABR bandwidth estimator starts at 100 Mbps / 5ms RTT and requests large multi-MB
   * video chunks instead of small 256KB segments.
   */
  function installNetworkInfoSpoof() {
    try {
      const fastConnection = {
        downlink: 100,
        downlinkMax: 1000,
        effectiveType: '4g',
        rtt: 5,
        saveData: false,
        type: 'ethernet',
        onchange: null,
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return true;
        }
      };

      if (typeof window.Navigator !== 'undefined' && window.Navigator.prototype) {
        Object.defineProperty(window.Navigator.prototype, 'connection', {
          get: function () {
            return fastConnection;
          },
          configurable: true
        });
      }
    } catch (err) {
      // Fail silently if navigator.connection is locked
    }
  }

  /**
   * PILAR 3.2: Pre-seed YouTube's internal quality storage keys before player bootstrap
   * so the very first DASH manifest request targets 2160p (4K) instead of 480p/720p.
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
      // Ignore storage quota or sandbox restrictions
    }
  }

  /**
   * Determines whether a given MIME type string should be blocked based on active hardware profile.
   * @param {string} mimeType
   * @param {number} [explicitFramerate]
   * @returns {boolean}
   */
  function shouldBlockMimeType(mimeType, explicitFramerate) {
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
      if (typeof explicitFramerate === 'number' && explicitFramerate > 30) {
        state.stats.blockedCodecChecks += 1;
        return true;
      }
      const fpsMatch = normalized.match(/framerate=(\d+)/);
      if (fpsMatch && Number(fpsMatch[1]) > 30) {
        state.stats.blockedCodecChecks += 1;
        return true;
      }
    }

    return false;
  }

  /**
   * PILAR 1: Installs hardware codec filtering hooks on MediaSource, HTMLMediaElement,
   * AND navigator.mediaCapabilities.decodingInfo (used by modern YouTube to benchmark
   * GPU smoothness and decide buffer allocation at 4K).
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

    // Hook MediaCapabilities.prototype.decodingInfo so YouTube sees 4K VP9 Profile 0
    // as 100% smooth & power-efficient hardware decoding, unlocking aggressive pre-buffering
    if (
      typeof window.MediaCapabilities !== 'undefined' &&
      window.MediaCapabilities.prototype &&
      typeof window.MediaCapabilities.prototype.decodingInfo === 'function'
    ) {
      const originalDecodingInfo = window.MediaCapabilities.prototype.decodingInfo;

      window.MediaCapabilities.prototype.decodingInfo = function (configuration) {
        try {
          if (state.config.enabled && configuration && configuration.video) {
            const contentType = configuration.video.contentType || '';
            const framerate = Number(configuration.video.framerate) || 0;

            if (shouldBlockMimeType(contentType, framerate)) {
              return Promise.resolve({
                supported: false,
                smooth: false,
                powerEfficient: false,
                keySystemAccess: null,
                configuration: configuration
              });
            }

            // Certify VP9 Profile 0 SDR and H.264 as ultra-smooth & power-efficient
            const lower = contentType.toLowerCase();
            if (lower.includes('vp09.00') || lower.includes('vp9') || lower.includes('avc1')) {
              return originalDecodingInfo.call(this, configuration).then(function (info) {
                if (info && info.supported) {
                  return Object.assign({}, info, {
                    supported: true,
                    smooth: true,
                    powerEfficient: true
                  });
                }
                return info;
              });
            }
          }
        } catch (e) {
          // Fall back to native decodingInfo
        }
        return originalDecodingInfo.call(this, configuration);
      };
    }
  }

  /**
   * PILAR 2: Creates a safe virtual TimeRanges view for HTMLMediaElement.prototype.buffered
   * that preserves all ranges while clamping the active range's end to (currentTime + maxAheadSec)
   * when real buffer is below targetBufferSec.
   * Note: SourceBuffer.prototype.buffered is intentionally left 100% native so MSE
   * appendBuffer verification never throws errors.
   * @param {TimeRanges} realRanges
   * @param {number} currentTime
   * @param {number} maxAheadSec
   * @returns {TimeRanges}
   */
  function createClampedVideoTimeRanges(realRanges, currentTime, maxAheadSec) {
    if (!realRanges || realRanges.length === 0) {
      return realRanges;
    }

    const clampedPairs = [];
    const horizon = currentTime + maxAheadSec;
    let didClamp = false;

    for (let i = 0; i < realRanges.length; i += 1) {
      const start = realRanges.start(i);
      const end = realRanges.end(i);

      if (currentTime >= start - 0.5 && currentTime <= end && end > horizon) {
        clampedPairs.push([start, Math.max(start, horizon)]);
        didClamp = true;
      } else {
        clampedPairs.push([start, end]);
      }
    }

    if (!didClamp) {
      return realRanges;
    }

    const proto =
      typeof window.TimeRanges !== 'undefined' && window.TimeRanges.prototype
        ? window.TimeRanges.prototype
        : Object.prototype;

    const virtualRanges = Object.create(proto);

    Object.defineProperty(virtualRanges, 'length', {
      get: function () {
        return clampedPairs.length;
      }
    });

    virtualRanges.start = function (index) {
      const idx = index >>> 0;
      if (idx >= clampedPairs.length) {
        throw new DOMException('Index or size is negative or greater than the allowed amount', 'IndexSizeError');
      }
      return clampedPairs[idx][0];
    };

    virtualRanges.end = function (index) {
      const idx = index >>> 0;
      if (idx >= clampedPairs.length) {
        throw new DOMException('Index or size is negative or greater than the allowed amount', 'IndexSizeError');
      }
      return clampedPairs[idx][1];
    };

    return virtualRanges;
  }

  /**
   * Determines if HTMLMediaElement.prototype.buffered clamping should be active
   * @param {HTMLVideoElement | null} video
   * @returns {boolean}
   */
  function shouldClampVideoBufferHorizon(video) {
    if (!state.config.enabled || !state.config.deepPreBuffer || !video) {
      state.virtualBufferActive = false;
      return false;
    }

    if (video.paused || video.ended || video.seeking || video.currentTime < 2.0) {
      state.virtualBufferActive = false;
      return false;
    }

    const now = Date.now();
    if (state.mseQuotaWarning && now < state.mseQuotaWarningUntil) {
      state.virtualBufferActive = false;
      return false;
    }
    if (state.mseQuotaWarning && now >= state.mseQuotaWarningUntil) {
      state.mseQuotaWarning = false;
    }

    const targetSec = Math.max(30, Number(state.config.targetBufferSec) || 120);
    const realAhead = state.realBufferAheadSec;

    if (realAhead >= targetSec) {
      state.bufferGoalReached = true;
    } else if (realAhead < targetSec * 0.82) {
      state.bufferGoalReached = false;
    }

    if (state.bufferGoalReached || realAhead <= VIRTUAL_BUFFER_HORIZON_SEC) {
      state.virtualBufferActive = false;
      return false;
    }

    state.virtualBufferActive = true;
    return true;
  }

  /**
   * Installs Virtual Buffer Horizon on HTMLMediaElement.prototype.buffered
   */
  function installVirtualBufferHorizon() {
    if (nativeVideoBufferedDesc && typeof nativeVideoBufferedDesc.get === 'function') {
      try {
        Object.defineProperty(window.HTMLMediaElement.prototype, 'buffered', {
          get: function () {
            const realRanges = nativeVideoBufferedDesc.get.call(this);
            if (shouldClampVideoBufferHorizon(this)) {
              return createClampedVideoTimeRanges(realRanges, this.currentTime || 0, VIRTUAL_BUFFER_HORIZON_SEC);
            }
            return realRanges;
          },
          configurable: true
        });
      } catch (err) {
        // Fallback silently
      }
    }
  }

  /**
   * Hooks MediaSource.prototype.addSourceBuffer to monitor MSE chunk appends
   * and handle QuotaExceededError safely without interfering with updateend.
   */
  function installMSEBufferHooks() {
    if (typeof window.MediaSource === 'undefined' || !window.MediaSource.prototype) {
      return;
    }

    const originalAddSourceBuffer = window.MediaSource.prototype.addSourceBuffer;

    window.MediaSource.prototype.addSourceBuffer = function (mimeType) {
      const sourceBuffer = originalAddSourceBuffer.call(this, mimeType);

      try {
        const isVideoBuffer = typeof mimeType === 'string' && mimeType.toLowerCase().includes('video');

        if (typeof mimeType === 'string') {
          if (isVideoBuffer) {
            state.activeMimeTypes.video = mimeType;
          } else if (mimeType.toLowerCase().includes('audio')) {
            state.activeMimeTypes.audio = mimeType;
          }
        }

        if (sourceBuffer && typeof sourceBuffer.appendBuffer === 'function') {
          const originalAppendBuffer = sourceBuffer.appendBuffer;

          sourceBuffer.appendBuffer = function (data) {
            if (isVideoBuffer && data) {
              state.stats.appendedVideoChunks += 1;
              state.stats.appendedVideoBytes += data.byteLength || 0;
            }

            try {
              return originalAppendBuffer.call(this, data);
            } catch (err) {
              if (err && err.name === 'QuotaExceededError') {
                state.mseQuotaWarning = true;
                state.mseQuotaWarningUntil = Date.now() + 10000;
              }
              throw err;
            }
          };
        }
      } catch (err) {
        // Never break native playback
      }

      return sourceBuffer;
    };
  }

  /**
   * Injects a <link rel="preconnect"> tag for googlevideo.com CDN hosts to eliminate
   * TCP/TLS/QUIC handshake latency on upcoming video chunks.
   * @param {string} origin
   */
  function ensureCdnPreconnect(origin) {
    if (!origin || state.preconnectedOrigins.has(origin) || !document.head) {
      return;
    }
    state.preconnectedOrigins.add(origin);
    try {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      state.stats.prefetchedChunks += 1;
    } catch (e) {
      // Ignore DOM errors
    }
  }

  /**
   * Checks if a URL is a heavy main-thread YouTube telemetry/logging endpoint
   * (Preserves /api/stats/watchtime so watch history works normally)
   * @param {string} urlStr
   * @returns {boolean}
   */
  function isHeavyTelemetryEndpoint(urlStr) {
    if (!state.config.enabled || typeof urlStr !== 'string') {
      return false;
    }
    if (urlStr.includes('/api/stats/watchtime')) {
      return false;
    }
    return (
      urlStr.includes('/youtubei/v1/log_event') ||
      urlStr.includes('/api/stats/qoe') ||
      urlStr.includes('/api/stats/atr') ||
      urlStr.includes('/ptracking')
    );
  }

  /**
   * PILAR 3.3 & PILAR 4.2: Hooks window.fetch and navigator.sendBeacon for:
   * - Automatic CDN origin pre-warming
   * - Blocking CPU-draining main-thread telemetry serialization during 4K playback
   *   with valid JSON {} responses
   */
  function installStreamAndBeaconHooks() {
    if (typeof window.navigator !== 'undefined' && typeof window.navigator.sendBeacon === 'function') {
      const originalSendBeacon = window.navigator.sendBeacon.bind(window.navigator);
      window.navigator.sendBeacon = function (url, data) {
        if (isHeavyTelemetryEndpoint(String(url))) {
          state.stats.blockedTelemetryBeacons += 1;
          return true;
        }
        return originalSendBeacon(url, data);
      };
    }

    if (!originalFetch) {
      return;
    }

    window.fetch = function (input, init) {
      const urlStr = typeof input === 'string' ? input : input && input.url ? input.url : '';

      if (isHeavyTelemetryEndpoint(urlStr)) {
        state.stats.blockedTelemetryBeacons += 1;
        return Promise.resolve(
          new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }

      if (state.config.enabled && state.config.parallelPrefetch && urlStr.includes('googlevideo.com/videoplayback')) {
        try {
          const parsedUrl = new URL(urlStr, window.location.origin);
          ensureCdnPreconnect(parsedUrl.origin);
        } catch (e) {
          // Ignore URL parse error
        }
      }

      return originalFetch(input, init);
    };
  }

  /**
   * Calculates real buffered time ahead of current playback position using unclamped native getter
   * @param {HTMLVideoElement} video
   * @returns {{ bufferAhead: number, nextGapStart: number | null }}
   */
  function analyzeVideoBuffer(video) {
    const ranges = getRealVideoBuffered(video);
    if (!video || !ranges || ranges.length === 0) {
      return { bufferAhead: 0, nextGapStart: null };
    }

    const currentTime = video.currentTime;
    let bufferAhead = 0;
    let nextGapStart = null;

    for (let i = 0; i < ranges.length; i += 1) {
      const start = ranges.start(i);
      const end = ranges.end(i);

      if (currentTime >= start - 0.25 && currentTime <= end + 0.05) {
        bufferAhead = Math.max(0, end - currentTime);
        if (i + 1 < ranges.length) {
          const nextStart = ranges.start(i + 1);
          if (nextStart - end > 0 && nextStart - end < 1.5) {
            nextGapStart = nextStart;
          }
        }
        break;
      } else if (start > currentTime && start - currentTime < 0.95) {
        nextGapStart = start;
        break;
      }
    }

    return { bufferAhead, nextGapStart };
  }

  /**
   * Recovers from MSE Micro-Gaps (prevents infinite buffering spinner when segments have tiny timestamp gaps)
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
      if (now - state.stats.lastStallTimestamp > 1200) {
        video.currentTime = bufferInfo.nextGapStart + 0.02;
        state.stats.microGapsRecovered += 1;
        state.stats.lastStallTimestamp = now;
      }
    }
  }

  /**
   * Optional Headstart Buffer Boost: holds playback at second zero (up to 1.5s max)
   * until an initial 4K buffer cushion is ready.
   * @param {HTMLVideoElement} video
   * @param {string | null} videoId
   * @param {number} realBufferAhead
   */
  function applyHeadstartBufferBoost(video, videoId, realBufferAhead) {
    if (!state.config.enabled || !state.config.headstartBoost || !video || !videoId) {
      return;
    }

    if (state.headstartState.videoId !== videoId) {
      if (state.headstartState.timerId) {
        clearTimeout(state.headstartState.timerId);
      }
      state.headstartState = {
        videoId,
        active: false,
        startedAt: 0,
        completed: false,
        timerId: null
      };
    }

    if (state.headstartState.completed) {
      return;
    }

    const targetCushionSec = 4.0;
    const maxHoldMs = 1500;

    if (video.currentTime > 1.2 || realBufferAhead >= targetCushionSec) {
      if (state.headstartState.active) {
        state.headstartState.active = false;
        state.headstartState.completed = true;
        if (video.paused && !video.ended) {
          video.play().catch(function () {});
        }
      } else {
        state.headstartState.completed = true;
      }
      return;
    }

    if (!state.headstartState.active && !video.paused && video.currentTime < 0.8 && realBufferAhead < 2.0) {
      state.headstartState.active = true;
      state.headstartState.startedAt = Date.now();
      try {
        video.pause();
      } catch (e) {}

      state.headstartState.timerId = setTimeout(function () {
        if (state.headstartState.active && state.headstartState.videoId === videoId) {
          state.headstartState.active = false;
          state.headstartState.completed = true;
          if (video.paused && !video.ended) {
            video.play().catch(function () {});
          }
        }
      }, maxHoldMs);
    }
  }

  /**
   * Enforces Target Quality on YouTube's internal #movie_player API.
   * Returns true ONLY when quality levels were available and locked.
   * @param {HTMLElement | null} player
   * @param {boolean} forceApply
   * @returns {boolean}
   */
  function enforcePlayerQuality(player, forceApply) {
    if (!state.config.enabled || !player || state.config.targetQuality === 'auto') {
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

      let desiredQuality = state.config.targetQuality;
      if (state.dropGuardTriggered && desiredQuality === 'hd2160' && available.includes('hd1440')) {
        desiredQuality = 'hd1440';
      }

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

      const currentQuality =
        typeof player.getPlaybackQuality === 'function' ? player.getPlaybackQuality() : null;

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

      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Binds immediate state change listeners to #movie_player so quality is locked
   * at millisecond zero without waiting for the polling cycle.
   * @param {HTMLElement | null} player
   */
  function bindPlayerListeners(player) {
    if (!player || state.boundPlayers.has(player)) {
      return;
    }
    try {
      if (typeof player.addEventListener === 'function') {
        player.addEventListener('onStateChange', function (playerState) {
          if (playerState === -1 || playerState === 1 || playerState === 3) {
            enforcePlayerQuality(player, true);
          }
        });
        state.boundPlayers.add(player);
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Disables YouTube's GPU-heavy Ambient Mode (Cinematic Lighting) when configured
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
   * Periodic Monitor Loop: Evaluates player state, real vs. virtual buffer health,
   * frame drops, headstart boost, and dispatches metrics to Popup & Service Worker.
   */
  function runMonitorCycle() {
    const player = document.getElementById('movie_player');
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

    optimizePlayerDOM();
    bindPlayerListeners(player);

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
      state.bufferGoalReached = false;
      seedYouTubeQualityStorage(state.config.targetQuality);
    }

    const bufferInfo = analyzeVideoBuffer(video);
    state.realBufferAheadSec = bufferInfo.bufferAhead;

    applyHeadstartBufferBoost(video, currentVideoId, bufferInfo.bufferAhead);
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
      const applied = enforcePlayerQuality(player, shouldForce);
      if (applied && currentVideoId) {
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

    const resolution =
      video && video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : 'N/A';

    const payload = {
      timestamp: Date.now(),
      videoId: currentVideoId,
      currentQuality,
      targetQuality: state.config.targetQuality,
      targetBufferSec: state.config.targetBufferSec,
      availableQualities,
      resolution,
      bufferAheadSec: Number(bufferInfo.bufferAhead.toFixed(2)),
      virtualBufferActive: state.virtualBufferActive,
      bufferGoalReached: state.bufferGoalReached,
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
      evictedBackBufferCount: state.stats.evictedBackBufferCount,
      prefetchHits: state.stats.prefetchHits,
      prefetchedChunks: state.stats.prefetchedChunks,
      prefetchedMB: Number((state.stats.prefetchedBytes / (1024 * 1024)).toFixed(2)),
      blockedTelemetryBeacons: state.stats.blockedTelemetryBeacons,
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
        state.dropGuardTriggered = false;
        state.qualityAppliedForVideo = null;
        const player = document.getElementById('movie_player');
        enforcePlayerQuality(player, true);
      }
    }
  });

  // Listen for manual quality enforcement requests from Popup
  window.addEventListener('MQ4K_FORCE_QUALITY_NOW', function () {
    const player = document.getElementById('movie_player');
    state.dropGuardTriggered = false;
    state.bufferGoalReached = false;
    state.qualityAppliedForVideo = null;
    seedYouTubeQualityStorage(state.config.targetQuality);
    enforcePlayerQuality(player, true);
    runMonitorCycle();
  });

  // Capture-phase media listeners to lock 4K quality at millisecond zero
  ['loadstart', 'loadedmetadata', 'canplay'].forEach(function (evtName) {
    document.addEventListener(
      evtName,
      function (evt) {
        if (evt && evt.target && evt.target.tagName === 'VIDEO') {
          const player = document.getElementById('movie_player');
          bindPlayerListeners(player);
          enforcePlayerQuality(player, true);
        }
      },
      true
    );
  });

  // Bootstrap all v2.0 engines immediately at document_start
  installNetworkInfoSpoof();
  seedYouTubeQualityStorage(state.config.targetQuality);
  installCodecHooks();
  installVirtualBufferHorizon();
  installMSEBufferHooks();
  installStreamAndBeaconHooks();

  // Hook YouTube SPA navigation events
  window.addEventListener('yt-navigate-start', function () {
    seedYouTubeQualityStorage(state.config.targetQuality);
  });

  window.addEventListener('yt-navigate-finish', function () {
    seedYouTubeQualityStorage(state.config.targetQuality);
    setTimeout(runMonitorCycle, 150);
  });

  setInterval(runMonitorCycle, 750);
})();
