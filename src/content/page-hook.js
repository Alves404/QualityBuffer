/**
 * My Quality 4k v2.0 - Deep Pre-Buffer & Zero-Track-Laying Engine (MAIN World)
 *
 * Executes in the main page context at document_start before YouTube initializes
 * its HTML5 player (#movie_player) and MediaSource Extensions (MSE).
 *
 * Core Engineering Pillars (v2.0):
 * 1. Virtual Buffer Horizon (TimeRanges Clamping + Proactive Back-Buffer Eviction):
 *    Unlocks YouTube's hardcoded ~15-20s 4K buffer cap by reporting a clamped 7.5s
 *    horizon to YouTube's DASH scheduler while real buffered video is below targetBufferSec
 *    (60s / 120s / 180s), and recycles watched back-buffer to prevent QuotaExceededError.
 * 2. Parallel Chunk Lookahead Pre-Fetcher & Stream Cache (fetch / XHR):
 *    Parses MP4 sidx (Segment Index) boxes from initialization chunks to pre-fetch
 *    upcoming byte ranges into a 64 MB RAM LRU cache before the player requests them.
 * 3. Zero-Track-Laying Bootstrap:
 *    Spoofs navigator.connection (100 Mbps / 5ms RTT), pre-seeds localStorage/sessionStorage
 *    yt-player-quality to 2160p before second zero, and hooks loadedmetadata/onStateChange.
 * 4. Hardware Codec Filtering, Headstart Buffer Boost & Main-Thread Telemetry Blocker:
 *    Blocks software-heavy AV1 (av01), 10-bit HDR (vp09.02), and optional >30fps streams,
 *    builds an initial 4K buffer cushion before playback starts, and blocks heavy
 *    main-thread tracking beacons (/log_event, /api/stats/qoe, /ptracking).
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
    headstartBoost: true,
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

  const VIRTUAL_BUFFER_HORIZON_SEC = 7.5;
  const MAX_PREFETCH_CACHE_BYTES = 64 * 1024 * 1024; // 64 MB LRU RAM Cache
  const MAX_PREFETCH_ENTRIES = 14;

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
    videoSourceBuffers: new Set(),
    segmentIndexMap: new Map(), // streamKey -> Array<{start: number, end: number}>
    prefetchCache: new Map(),   // cacheKey -> { promise, buffer, size, timestamp, headers }
    prefetchCacheBytes: 0,
    headstartState: {
      videoId: null,
      active: false,
      startedAt: 0,
      completed: false,
      timerId: null
    },
    boundPlayers: new WeakSet()
  };

  // Capture native descriptors before installing hooks
  const nativeVideoBufferedDesc =
    typeof window.HTMLMediaElement !== 'undefined' && window.HTMLMediaElement.prototype
      ? Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'buffered')
      : null;

  const nativeSourceBufferedDesc =
    typeof window.SourceBuffer !== 'undefined' && window.SourceBuffer.prototype
      ? Object.getOwnPropertyDescriptor(window.SourceBuffer.prototype, 'buffered')
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
   * Returns the real, unclamped TimeRanges of a SourceBuffer
   * @param {SourceBuffer} sb
   * @returns {TimeRanges | null}
   */
  function getRealSourceBuffered(sb) {
    if (!sb) {
      return null;
    }
    try {
      if (nativeSourceBufferedDesc && typeof nativeSourceBufferedDesc.get === 'function') {
        return nativeSourceBufferedDesc.get.call(sb);
      }
      return sb.buffered;
    } catch (e) {
      return null;
    }
  }

  /**
   * PILAR 3.1: Spoof Network Information API (navigator.connection) so YouTube's
   * initial ABR bandwidth estimator starts at 100 Mbps / 5ms RTT from second zero.
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
   * Installs hardware codec filtering hooks on MediaSource and HTMLMediaElement
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
   * PILAR 1: Creates a virtual TimeRanges object that clamps buffered end time to
   * (currentTime + maxAheadSec) so YouTube's DASH scheduler keeps fetching future minutes.
   * @param {TimeRanges} realRanges
   * @param {number} currentTime
   * @param {number} maxAheadSec
   * @returns {TimeRanges}
   */
  function createClampedTimeRanges(realRanges, currentTime, maxAheadSec) {
    if (!realRanges || realRanges.length === 0) {
      return realRanges;
    }

    const clampedPairs = [];
    const horizon = currentTime + maxAheadSec;

    for (let i = 0; i < realRanges.length; i += 1) {
      const start = realRanges.start(i);
      const end = realRanges.end(i);

      if (currentTime >= start - 0.5 && currentTime <= end) {
        const clampedEnd = end > horizon ? horizon : end;
        clampedPairs.push([start, Math.max(start, clampedEnd)]);
      } else if (end < currentTime) {
        clampedPairs.push([start, end]);
      }
    }

    if (clampedPairs.length === 0) {
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
   * Determines if Virtual Buffer Horizon clamping should be active right now
   * @param {HTMLVideoElement | null} video
   * @returns {boolean}
   */
  function shouldClampBufferHorizon(video) {
    if (!state.config.enabled || !state.config.deepPreBuffer || !video) {
      state.virtualBufferActive = false;
      return false;
    }

    if (video.ended || video.seeking) {
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

    // Hysteresis to prevent rapid toggling near targetBufferSec
    if (realAhead >= targetSec) {
      state.bufferGoalReached = true;
    } else if (realAhead < targetSec * 0.82) {
      state.bufferGoalReached = false;
    }

    if (state.bufferGoalReached) {
      state.virtualBufferActive = false;
      return false;
    }

    state.virtualBufferActive = realAhead > VIRTUAL_BUFFER_HORIZON_SEC;
    return true;
  }

  /**
   * PILAR 1.2: Installs Virtual Buffer Horizon getters on HTMLMediaElement.prototype.buffered
   * and SourceBuffer.prototype.buffered
   */
  function installVirtualBufferHorizon() {
    if (nativeVideoBufferedDesc && typeof nativeVideoBufferedDesc.get === 'function') {
      try {
        Object.defineProperty(window.HTMLMediaElement.prototype, 'buffered', {
          get: function () {
            const realRanges = nativeVideoBufferedDesc.get.call(this);
            if (shouldClampBufferHorizon(this)) {
              return createClampedTimeRanges(realRanges, this.currentTime || 0, VIRTUAL_BUFFER_HORIZON_SEC);
            }
            return realRanges;
          },
          configurable: true
        });
      } catch (err) {
        // Fallback silently
      }
    }

    if (nativeSourceBufferedDesc && typeof nativeSourceBufferedDesc.get === 'function') {
      try {
        Object.defineProperty(window.SourceBuffer.prototype, 'buffered', {
          get: function () {
            const realRanges = nativeSourceBufferedDesc.get.call(this);
            const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (video && shouldClampBufferHorizon(video)) {
              return createClampedTimeRanges(realRanges, video.currentTime || 0, VIRTUAL_BUFFER_HORIZON_SEC);
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
   * PILAR 1.3: Proactively evicts watched back-buffer (>18s behind currentTime)
   * so Chromium's MSE memory cap can hold 2-3 minutes of upcoming 4K video without QuotaExceededError.
   * @param {SourceBuffer} sourceBuffer
   */
  function evictOldBackBuffer(sourceBuffer) {
    if (!state.config.enabled || !state.config.deepPreBuffer || !sourceBuffer || sourceBuffer.updating) {
      return;
    }

    try {
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (!video || video.seeking || video.currentTime < 28) {
        return;
      }

      const realRanges = getRealSourceBuffered(sourceBuffer);
      if (!realRanges || realRanges.length === 0) {
        return;
      }

      const earliestBuffered = realRanges.start(0);
      const keepBehindSec = 12;
      const evictThresholdSec = 22;

      if (video.currentTime - earliestBuffered > evictThresholdSec) {
        const removeEnd = Math.floor(video.currentTime - keepBehindSec);
        if (removeEnd > earliestBuffered + 2) {
          sourceBuffer.remove(earliestBuffered, removeEnd);
          state.stats.evictedBackBufferCount += 1;
        }
      }
    } catch (err) {
      // Ignore transient MSE state exceptions
    }
  }

  /**
   * Hooks MediaSource.prototype.addSourceBuffer to monitor MSE buffer health,
   * handle QuotaExceededError gracefully, and schedule back-buffer recycling.
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
            state.videoSourceBuffers.add(sourceBuffer);
          } else if (mimeType.toLowerCase().includes('audio')) {
            state.activeMimeTypes.audio = mimeType;
          }
        }

        if (sourceBuffer && typeof sourceBuffer.addEventListener === 'function') {
          sourceBuffer.addEventListener('updateend', function () {
            if (isVideoBuffer) {
              const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
              if (video) {
                const info = analyzeVideoBuffer(video);
                state.realBufferAheadSec = info.bufferAhead;
              }
            }
            evictOldBackBuffer(sourceBuffer);
          });
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
                // MSE memory ceiling reached: pause horizon clamping briefly and evict watched back-buffer
                state.mseQuotaWarning = true;
                state.mseQuotaWarningUntil = Date.now() + 8000;

                try {
                  const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
                  if (video && !this.updating && video.currentTime > 10) {
                    this.remove(0, Math.max(1, Math.floor(video.currentTime - 5)));
                    state.stats.evictedBackBufferCount += 1;
                  }
                } catch (removeErr) {
                  // Ignore
                }
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
   * PILAR 2.1: Parses ISO-BMFF 'sidx' (Segment Index) box from initialization chunks (range=0-...)
   * to know exact upcoming segment byte ranges [start, end] for lookahead pre-fetching.
   * @param {ArrayBuffer} buffer
   * @returns {Array<{start: number, end: number}>}
   */
  function parseMp4SidxRanges(buffer) {
    const segments = [];
    if (!buffer || buffer.byteLength < 64) {
      return segments;
    }

    try {
      const view = new DataView(buffer);
      const len = buffer.byteLength;
      let offset = 0;

      while (offset + 8 <= len) {
        const boxSize = view.getUint32(offset);
        const boxType =
          String.fromCharCode(view.getUint8(offset + 4)) +
          String.fromCharCode(view.getUint8(offset + 5)) +
          String.fromCharCode(view.getUint8(offset + 6)) +
          String.fromCharCode(view.getUint8(offset + 7));

        if (boxSize < 8 || offset + boxSize > len) {
          break;
        }

        if (boxType === 'sidx') {
          const version = view.getUint8(offset + 8);
          let pos = offset + 12; // skip size(4), type(4), version+flags(4)
          pos += 8; // skip reference_ID(4), timescale(4)

          let firstOffset = 0;
          if (version === 0) {
            pos += 4; // earliest_presentation_time(4)
            firstOffset = view.getUint32(pos);
            pos += 4;
          } else {
            pos += 8; // earliest_presentation_time(8)
            const high = view.getUint32(pos);
            const low = view.getUint32(pos + 4);
            firstOffset = high * 4294967296 + low;
            pos += 8;
          }

          pos += 2; // reserved(2)
          const refCount = view.getUint16(pos);
          pos += 2;

          let currentByteStart = offset + boxSize + firstOffset;
          for (let i = 0; i < refCount && pos + 12 <= offset + boxSize; i += 1) {
            const refInfo = view.getUint32(pos);
            const refSize = refInfo & 0x7fffffff;
            if (refSize > 0) {
              segments.push({
                start: currentByteStart,
                end: currentByteStart + refSize - 1
              });
              currentByteStart += refSize;
            }
            pos += 12;
          }
          break;
        }

        offset += boxSize;
      }
    } catch (e) {
      // Ignore malformed headers
    }

    return segments;
  }

  /**
   * Builds a stable stream key from a googlevideo.com URL (id/docid + itag)
   * @param {URL} parsedUrl
   * @returns {string}
   */
  function getStreamKey(parsedUrl) {
    const id = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('docid') || 'stream';
    const itag = parsedUrl.searchParams.get('itag') || '0';
    return `${id}:${itag}`;
  }

  /**
   * Maintains LRU size limits on the in-memory chunk pre-fetch cache
   */
  function prunePrefetchCache() {
    const now = Date.now();
    for (const [key, entry] of state.prefetchCache.entries()) {
      if (now - entry.timestamp > 45000) {
        state.prefetchCacheBytes = Math.max(0, state.prefetchCacheBytes - (entry.size || 0));
        state.prefetchCache.delete(key);
      }
    }

    while (
      state.prefetchCache.size > MAX_PREFETCH_ENTRIES ||
      state.prefetchCacheBytes > MAX_PREFETCH_CACHE_BYTES
    ) {
      const oldestKey = state.prefetchCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      const oldest = state.prefetchCache.get(oldestKey);
      state.prefetchCacheBytes = Math.max(0, state.prefetchCacheBytes - (oldest && oldest.size ? oldest.size : 0));
      state.prefetchCache.delete(oldestKey);
    }
  }

  /**
   * Triggers an asynchronous background pre-fetch for the next contiguous segment in the index map
   * @param {URL} currentUrl
   * @param {string} streamKey
   * @param {number} currentRangeEnd
   */
  function scheduleNextSegmentPrefetch(currentUrl, streamKey, currentRangeEnd) {
    if (!originalFetch || !state.config.enabled || !state.config.parallelPrefetch) {
      return;
    }

    const targetSec = Math.max(30, Number(state.config.targetBufferSec) || 120);
    if (state.realBufferAheadSec >= targetSec) {
      return;
    }

    const segments = state.segmentIndexMap.get(streamKey);
    if (!Array.isArray(segments) || segments.length === 0) {
      return;
    }

    const nextByteStart = currentRangeEnd + 1;
    const nextSeg = segments.find(function (seg) {
      return Math.abs(seg.start - nextByteStart) <= 4;
    });

    if (!nextSeg) {
      return;
    }

    const nextRangeStr = `${nextSeg.start}-${nextSeg.end}`;
    const cacheKey = `${streamKey}:${nextRangeStr}`;
    if (state.prefetchCache.has(cacheKey)) {
      return;
    }

    prunePrefetchCache();

    try {
      const prefetchUrl = new URL(currentUrl.toString());
      prefetchUrl.searchParams.set('range', nextRangeStr);

      const entry = {
        promise: null,
        buffer: null,
        size: 0,
        contentType: 'application/octet-stream',
        timestamp: Date.now()
      };

      entry.promise = originalFetch(prefetchUrl.toString(), {
        method: 'GET',
        credentials: 'include',
        mode: 'cors'
      })
        .then(function (resp) {
          if (!resp || !resp.ok) {
            state.prefetchCache.delete(cacheKey);
            return null;
          }
          entry.contentType = resp.headers.get('content-type') || 'video/webm';
          return resp.arrayBuffer();
        })
        .then(function (buf) {
          if (!buf || buf.byteLength === 0) {
            state.prefetchCache.delete(cacheKey);
            return null;
          }
          entry.buffer = buf;
          entry.size = buf.byteLength;
          entry.timestamp = Date.now();
          state.prefetchCacheBytes += buf.byteLength;
          state.stats.prefetchedChunks += 1;
          state.stats.prefetchedBytes += buf.byteLength;
          return buf;
        })
        .catch(function () {
          state.prefetchCache.delete(cacheKey);
          return null;
        });

      state.prefetchCache.set(cacheKey, entry);
    } catch (e) {
      // Ignore URL construction errors
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
   * PILAR 2.2 & PILAR 4.2: Hooks window.fetch and navigator.sendBeacon for:
   * - Stream initialization sidx parsing & lookahead RAM pre-fetching
   * - Blocking CPU-draining main-thread telemetry serialization during 4K playback
   */
  function installStreamPrefetchAndBeaconHooks() {
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
        return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
      }

      if (
        state.config.enabled &&
        urlStr.includes('googlevideo.com/videoplayback') &&
        (!init || !init.method || init.method.toUpperCase() === 'GET')
      ) {
        try {
          const parsedUrl = new URL(urlStr, window.location.origin);
          const rangeParam = parsedUrl.searchParams.get('range');

          if (rangeParam) {
            const streamKey = getStreamKey(parsedUrl);
            const cacheKey = `${streamKey}:${rangeParam}`;

            // Serve from RAM cache if pre-fetched
            if (state.prefetchCache.has(cacheKey)) {
              const cached = state.prefetchCache.get(cacheKey);
              state.prefetchCache.delete(cacheKey);
              state.prefetchCacheBytes = Math.max(0, state.prefetchCacheBytes - (cached.size || 0));

              return Promise.resolve(cached.promise).then(function (buf) {
                if (buf && buf.byteLength > 0) {
                  state.stats.prefetchHits += 1;
                  return new Response(buf, {
                    status: 200,
                    headers: {
                      'Content-Type': cached.contentType || 'video/webm',
                      'Content-Length': String(buf.byteLength)
                    }
                  });
                }
                return originalFetch(input, init);
              });
            }

            const rangeParts = rangeParam.split('-');
            const rangeStart = Number(rangeParts[0]);
            const rangeEnd = Number(rangeParts[1]);

            // Parse initialization chunk (range=0-...) to populate sidx segment index map
            if (rangeStart === 0 && rangeEnd > 0 && rangeEnd <= 131072) {
              return originalFetch(input, init).then(function (response) {
                try {
                  const cloned = response.clone();
                  cloned
                    .arrayBuffer()
                    .then(function (buf) {
                      const sidxSegments = parseMp4SidxRanges(buf);
                      if (sidxSegments.length > 0) {
                        state.segmentIndexMap.set(streamKey, sidxSegments);
                      }
                    })
                    .catch(function () {});
                } catch (e) {
                  // Ignore clone error
                }
                return response;
              });
            }

            // Schedule lookahead pre-fetch for the next contiguous segment
            if (!Number.isNaN(rangeEnd) && rangeEnd > 0) {
              scheduleNextSegmentPrefetch(parsedUrl, streamKey, rangeEnd);
            }
          }
        } catch (err) {
          // Proceed with native fetch
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
   * PILAR 4.1: Headstart Buffer Boost
   * Briefly holds playback at second zero (up to 1.8s max) until a solid 4.5s 4K buffer
   * cushion is ready, preventing "laying tracks while the train is already moving".
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

    const targetCushionSec = 4.5;
    const maxHoldMs = 1800;

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

    if (!state.headstartState.active && !video.paused && video.currentTime < 0.8 && realBufferAhead < 2.5) {
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
    } else if (state.headstartState.active && Date.now() - state.headstartState.startedAt >= maxHoldMs) {
      state.headstartState.active = false;
      state.headstartState.completed = true;
      if (video.paused && !video.ended) {
        video.play().catch(function () {});
      }
    }
  }

  /**
   * PILAR 3.3: Enforces Target Quality on YouTube's internal #movie_player API.
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
   * at millisecond zero without waiting for the 1000ms polling cycle.
   * @param {HTMLElement | null} player
   */
  function bindPlayerListeners(player) {
    if (!player || state.boundPlayers.has(player)) {
      return;
    }
    try {
      if (typeof player.addEventListener === 'function') {
        player.addEventListener('onStateChange', function (playerState) {
          // -1 = unstarted, 1 = playing, 3 = buffering
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

    // FIXED RACE CONDITION: Only mark qualityAppliedForVideo when enforcePlayerQuality returns true
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
  installStreamPrefetchAndBeaconHooks();

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
