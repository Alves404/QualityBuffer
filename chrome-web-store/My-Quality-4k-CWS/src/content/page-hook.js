/**
 * My Quality 4k v2.1 - Deep Pre-Buffer & SABR Horizon Unlocker Engine (MAIN World)
 *
 * Executes in the main page context at document_start before YouTube initializes
 * its HTML5 player (#movie_player), MediaSource Extensions (MSE), and SABR
 * (Server-Driven Adaptive Bitrate) streaming coordinator.
 *
 * Core Engineering Pillars:
 * 1. Hardware Codec & MediaCapabilities Acceleration (MediaSource + MediaCapabilities API):
 *    Blocks software-heavy AV1 (av01), 10-bit HDR (vp09.02), and optional >30fps streams
 *    across both MediaSource and navigator.mediaCapabilities.decodingInfo, while certifying
 *    VP9 Profile 0 (4K SDR) as { supported: true, smooth: true, powerEfficient: true }.
 * 2. Deep Pre-Buffer SABR & Policy Unlocker (60s / 120s / 180s Multi-Minute Buffering):
 *    - Intercepts YouTube's internal player policy (g.vWa) via Object.prototype.videoTrack
 *      to unlock the hardcoded 35 MB 4K video byte cap (ya: 36700160 -> 512 MB / 536870912)
 *      and 5 MB audio byte cap (Ta: 5242880 -> 64 MB / 67108864), as well as min/max
 *      readahead seconds (sb / ha -> targetBufferSec).
 *    - Hooks SABR NextRequestPolicy (Mq / targetVideoReadaheadMs / targetAudioReadaheadMs)
 *      and outgoing SABR request builder (RO / bc / mp / UF / TF) so googlevideo.com
 *      continues streaming 4K segments past the default 15-16 second ceiling up to the
 *      user-selected horizon (60s, 120s, or 180s).
 * 3. Zero-Track-Laying Bootstrap & CDN Preconnect:
 *    Spoofs navigator.connection (100 Mbps / 5ms RTT), pre-seeds yt-player-quality to
 *    2160p before second zero, and pre-warms googlevideo.com CDN nodes.
 * 4. Main-Thread Telemetry Blocker & Compositor Optimization:
 *    Short-circuits heavy YouTube diagnostic beacons (/log_event, /api/stats/qoe)
 *    with valid JSON responses while preserving /api/stats/watchtime, /ptracking, and /api/stats/atr.
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

  const VIDEO_BUFFER_BYTE_CAP = 536870912; // 512 MB (replaces YouTube's 35 MB cap that stops 4K at 16s)
  const AUDIO_BUFFER_BYTE_CAP = 67108864;  // 64 MB (replaces YouTube's 5-8 MB audio cap)
  const CHUNK_REQUEST_BYTE_CAP = 16777216; // 16 MB per request

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
    activeYtLoader: null,
    activeSabrCoordinator: null,
    patchedPolicies: new WeakSet(),
    patchedProtos: new WeakSet(),
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

  const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  /**
   * Returns the configured target pre-buffer horizon in seconds (60, 120, or 180)
   * @returns {number}
   */
  function getTargetBufferSeconds() {
    return Math.max(30, Number(state.config.targetBufferSec) || 120);
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
   * so the very first manifest/SABR request targets 2160p (4K) instead of 480p/720p.
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
   * AND navigator.mediaCapabilities.decodingInfo.
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
   * Locks a property on YouTube's internal policy object (g.vWa) to a dynamic getter
   * so internal functions like fPa (which caps 4K at 35MB / 16.3s) or tQa cannot lower it.
   * @param {object} obj
   * @param {string} key
   * @param {() => number} activeValueGetter
   */
  function lockPolicyProperty(obj, key, activeValueGetter) {
    let rawValue = obj[key];
    try {
      Object.defineProperty(obj, key, {
        get: function () {
          if (state.config.enabled && state.config.deepPreBuffer && !state.mseQuotaWarning) {
            return activeValueGetter();
          }
          return rawValue;
        },
        set: function (val) {
          rawValue = val;
        },
        enumerable: true,
        configurable: true
      });
    } catch (e) {
      // Ignore non-configurable properties
    }
  }

  /**
   * Patches YouTube's internal player policy instance (g.vWa) to remove the 35 MB (16.0s)
   * 4K buffer ceiling and unlock full multi-minute readahead (60s / 120s / 180s).
   * @param {object} policy
   */
  function patchYouTubePolicyObject(policy) {
    if (!policy || typeof policy !== 'object' || state.patchedPolicies.has(policy)) {
      return;
    }
    state.patchedPolicies.add(policy);

    try {
      const keys = Object.keys(policy);

      for (let i = 0; i < keys.length; i += 1) {
        const k = keys[i];
        const val = policy[k];
        const nextKey = i + 1 < keys.length ? keys[i + 1] : null;
        const nextVal = nextKey ? policy[nextKey] : undefined;
        const nextNextKey = i + 2 < keys.length ? keys[i + 2] : null;
        const nextNextVal = nextNextKey ? policy[nextNextKey] : undefined;

        // Match [ya (20971520 / 36700160 / 104857600), Ta (8388608 / 5242880 / 13107200), ha (120)]
        if (
          (val === 20971520 || val === 36700160 || val === 104857600) &&
          (nextVal === 8388608 || nextVal === 5242880 || nextVal === 13107200)
        ) {
          lockPolicyProperty(policy, k, function () {
            return VIDEO_BUFFER_BYTE_CAP;
          });
          if (nextKey) {
            lockPolicyProperty(policy, nextKey, function () {
              return AUDIO_BUFFER_BYTE_CAP;
            });
          }
          if (nextNextKey && typeof nextNextVal === 'number' && nextNextVal >= 30 && nextNextVal <= 300) {
            lockPolicyProperty(policy, nextNextKey, function () {
              return Math.max(180, getTargetBufferSeconds());
            });
          }
          continue;
        }

        // Match [lD (1000), sb (15), al (1)] -> min readahead sec & growth rate
        if (val === 1000 && typeof nextVal === 'number' && nextVal >= 5 && nextVal <= 30 && nextNextVal === 1) {
          if (nextKey) {
            lockPolicyProperty(policy, nextKey, function () {
              return getTargetBufferSeconds();
            });
          }
          if (nextNextKey) {
            lockPolicyProperty(policy, nextNextKey, function () {
              return 60;
            });
          }
          continue;
        }

        // Match za (2097152 or 4194304) -> max chunk request size in bytes
        if ((val === 2097152 || val === 4194304) && k !== 'jc') {
          lockPolicyProperty(policy, k, function () {
            return CHUNK_REQUEST_BYTE_CAP;
          });
        }
      }

      // Also lock explicit property names if present in current build
      if (typeof policy.ya === 'number') {
        lockPolicyProperty(policy, 'ya', function () {
          return VIDEO_BUFFER_BYTE_CAP;
        });
      }
      if (typeof policy.Ta === 'number') {
        lockPolicyProperty(policy, 'Ta', function () {
          return AUDIO_BUFFER_BYTE_CAP;
        });
      }
      if (typeof policy.ha === 'number') {
        lockPolicyProperty(policy, 'ha', function () {
          return Math.max(180, getTargetBufferSeconds());
        });
      }
      if (typeof policy.sb === 'number') {
        lockPolicyProperty(policy, 'sb', function () {
          return getTargetBufferSeconds();
        });
      }
      if (typeof policy.f$ === 'number') {
        lockPolicyProperty(policy, 'f$', function () {
          return getTargetBufferSeconds() * 1000;
        });
      }
    } catch (e) {
      // Never break player initialization
    }
  }

  /**
   * Wraps prototype methods on YouTube's SABR coordinator (qkb) to:
   * 1. Boost Owa NextRequestPolicy (targetVideoReadaheadMs / targetAudioReadaheadMs -> targetBufferSec * 1000)
   * 2. Unlock SABR request byte budgets (UF = 512MB, TF = 64MB) and advance reported media
   *    horizon (mp) inside active buffered ranges (bc) so googlevideo.com streams continuously
   *    up to the user's selected minutes (60s / 120s / 180s).
   * @param {object} instance
   */
  function patchCoordinatorPrototype(instance) {
    if (!instance || typeof instance !== 'object') {
      return;
    }

    // Disable client-side SABR request rate-limit counter (GRa: a.U > 0 -> toomanyrequests)
    try {
      if (typeof instance.U === 'number' && instance.U > 0 && instance.fa && typeof instance.fa.vp === 'number') {
        instance.U = 0;
        state.activeSabrCoordinator = instance;
      }
    } catch (e) {
      // Ignore
    }

    const proto = Object.getPrototypeOf(instance);
    if (!proto || proto === Object.prototype || state.patchedProtos.has(proto)) {
      return;
    }
    state.patchedProtos.add(proto);

    const propNames = Object.getOwnPropertyNames(proto);
    for (let i = 0; i < propNames.length; i += 1) {
      const name = propNames[i];
      if (name === 'constructor') {
        continue;
      }

      let desc;
      try {
        desc = Object.getOwnPropertyDescriptor(proto, name);
      } catch (e) {
        continue;
      }

      if (!desc || typeof desc.value !== 'function') {
        continue;
      }

      const originalMethod = desc.value;

      try {
        proto[name] = function () {
          const isPreBufferActive =
            state.config.enabled && state.config.deepPreBuffer && !state.mseQuotaWarning;

          if (isPreBufferActive) {
            // Ensure SABR rate-limit ceiling (this.U) stays unlocked on coordinator instances
            if (typeof this.U === 'number' && this.U > 0 && this.fa && typeof this.fa.vp === 'number') {
              this.U = 0;
              state.activeSabrCoordinator = this;
            }

            // Intercept Mq(a, b) where a is Owa { targetAudioReadaheadMs, targetVideoReadaheadMs, backoffTimeMs }
            if (arguments.length > 0 && arguments[0] && typeof arguments[0] === 'object') {
              const arg0 = arguments[0];
              if ('targetVideoReadaheadMs' in arg0 || 'targetAudioReadaheadMs' in arg0) {
                const targetSec = getTargetBufferSeconds();
                const targetMs = targetSec * 1000;
                arg0.targetVideoReadaheadMs = Math.max(Number(arg0.targetVideoReadaheadMs) || 0, targetMs);
                arg0.targetAudioReadaheadMs = Math.max(Number(arg0.targetAudioReadaheadMs) || 0, targetMs);
                if (typeof arg0.backoffTimeMs === 'number' && state.realBufferAheadSec < targetSec) {
                  arg0.backoffTimeMs = Math.min(arg0.backoffTimeMs, 180);
                }
              }
            }
          }

          const result = originalMethod.apply(this, arguments);

          // Intercept RO(a) return payload { bc, Sl, mp, nextRequestPolicy, UF, TF, ... }
          if (
            isPreBufferActive &&
            result &&
            typeof result === 'object' &&
            Array.isArray(result.bc) &&
            typeof result.mp === 'number' &&
            'nextRequestPolicy' in result
          ) {
            try {
              const targetSec = getTargetBufferSeconds();
              const targetMs = targetSec * 1000;

              if (result.nextRequestPolicy && typeof result.nextRequestPolicy === 'object') {
                result.nextRequestPolicy.targetVideoReadaheadMs = Math.max(
                  Number(result.nextRequestPolicy.targetVideoReadaheadMs) || 0,
                  targetMs
                );
                result.nextRequestPolicy.targetAudioReadaheadMs = Math.max(
                  Number(result.nextRequestPolicy.targetAudioReadaheadMs) || 0,
                  targetMs
                );
              }

              // Boost max audio/video buffer byte limits sent in SABR ClientAbrState (fields 74 & 75)
              if (typeof result.UF === 'number') {
                result.UF = Math.max(result.UF, VIDEO_BUFFER_BYTE_CAP);
              }
              if (typeof result.TF === 'number') {
                result.TF = Math.max(result.TF, AUDIO_BUFFER_BYTE_CAP);
              }

              // Inspect active buffered ranges in result.bc covering current media position (result.mp)
              const realMp = result.mp;
              const activeRangeEnds = [];
              for (let j = 0; j < result.bc.length; j += 1) {
                const r = result.bc[j];
                if (
                  r &&
                  typeof r.startTimeMs === 'number' &&
                  typeof r.durationMs === 'number' &&
                  r.durationMs > 0
                ) {
                  const endMs = r.startTimeMs + r.durationMs;
                  if (realMp >= r.startTimeMs - 2500 && realMp <= endMs + 500) {
                    activeRangeEnds.push(endMs);
                  }
                }
              }

              if (activeRangeEnds.length > 0) {
                const minActiveEndMs = Math.min.apply(null, activeRangeEnds);
                const bufferedAheadMs = minActiveEndMs - realMp;

                if (bufferedAheadMs > 8000 && bufferedAheadMs < targetMs) {
                  // Report playhead 6s before the end of the active buffered range so
                  // googlevideo.com SABR server streams the next segments immediately
                  result.mp = Math.max(realMp, Math.round(minActiveEndMs - 6000));
                  state.virtualBufferActive = true;
                  state.bufferGoalReached = false;
                } else if (bufferedAheadMs >= targetMs) {
                  state.virtualBufferActive = false;
                  state.bufferGoalReached = true;
                }
              }
            } catch (e) {
              // Preserve original SABR payload on any unexpected structure
            }
          }

          return result;
        };
      } catch (e) {
        // Ignore read-only prototype methods
      }
    }
  }

  /**
   * PILAR 2: Installs Deep Pre-Buffer Unlocker across:
   * - Object.prototype.maxReadAheadMediaTimeMs / minReadAheadMediaTimeMs / readAheadGrowthRateMs
   * - Object.prototype.videoTrack (captures policy g.vWa, loader AWa, and SABR coordinator qkb)
   * - JSON.parse (rewrites dynamicReadaheadConfig & streamSelectionConfig in player responses)
   */
  function installDeepPreBufferUnlocker() {
    const readaheadProps = {
      maxReadAheadMediaTimeMs: function () {
        return Math.max(180000, getTargetBufferSeconds() * 1000);
      },
      minReadAheadMediaTimeMs: function () {
        return getTargetBufferSeconds() * 1000;
      },
      readAheadGrowthRateMs: function () {
        return 60000;
      }
    };

    Object.keys(readaheadProps).forEach(function (propName) {
      const symbolKey = Symbol('mq4k_' + propName);
      const getterFn = readaheadProps[propName];
      try {
        Object.defineProperty(Object.prototype, propName, {
          get: function () {
            if (state.config.enabled && state.config.deepPreBuffer && !state.mseQuotaWarning) {
              return getterFn();
            }
            return this[symbolKey];
          },
          set: function (val) {
            this[symbolKey] = val;
          },
          enumerable: false,
          configurable: true
        });
      } catch (e) {
        // Ignore if Object.prototype is frozen
      }
    });

    // Hook Object.prototype.videoTrack to intercept YouTube's internal loader, policy, and SABR coordinator
    const videoTrackSym = Symbol('mq4k_videoTrack');
    try {
      Object.defineProperty(Object.prototype, 'videoTrack', {
        get: function () {
          return this[videoTrackSym];
        },
        set: function (val) {
          this[videoTrackSym] = val;
          try {
            if (this && typeof this === 'object') {
              if (this.policy && typeof this.policy === 'object') {
                patchYouTubePolicyObject(this.policy);
              }
              if (this.oe && typeof this.oe === 'object') {
                patchYouTubePolicyObject(this.oe);
              }
              if (typeof this.mf === 'function' && typeof this.qp === 'function' && this.policy) {
                state.activeYtLoader = this;
              }
              patchCoordinatorPrototype(this);
            }
          } catch (e) {
            // Never interrupt property assignment
          }
        },
        enumerable: false,
        configurable: true
      });
    } catch (e) {
      // Ignore if already defined
    }

    // Hook JSON.parse to rewrite playerConfig.mediaCommonConfig.dynamicReadaheadConfig on arrival
    const origJsonParse = JSON.parse;
    JSON.parse = function () {
      const parsed = origJsonParse.apply(this, arguments);
      try {
        if (state.config.enabled && parsed && typeof parsed === 'object') {
          const pc = parsed.playerConfig || (parsed.playerResponse && parsed.playerResponse.playerConfig);
          if (pc && typeof pc === 'object') {
            const targetMs = getTargetBufferSeconds() * 1000;
            if (pc.mediaCommonConfig && typeof pc.mediaCommonConfig === 'object') {
              pc.mediaCommonConfig.dynamicReadaheadConfig = {
                maxReadAheadMediaTimeMs: Math.max(180000, targetMs),
                minReadAheadMediaTimeMs: targetMs,
                readAheadGrowthRateMs: 60000
              };
            }
            if (pc.streamSelectionConfig && typeof pc.streamSelectionConfig === 'object') {
              pc.streamSelectionConfig.maxBitrate = '999999999';
            }
          }

          // V12 Async CDN Origin Warm-up: pre-warm high-resolution video/audio CDN nodes at millisecond zero
          if (state.config.parallelPrefetch) {
            const sd = parsed.streamingData || (parsed.playerResponse && parsed.playerResponse.streamingData);
            if (sd && Array.isArray(sd.adaptiveFormats)) {
              for (let i = 0; i < sd.adaptiveFormats.length; i += 1) {
                const fmt = sd.adaptiveFormats[i];
                if (fmt && typeof fmt.url === 'string') {
                  const isHighResVideo = (typeof fmt.height === 'number' && fmt.height >= 1080) || fmt.itag === 313 || fmt.itag === 315;
                  const isPrimaryAudio = fmt.itag === 251 || fmt.itag === 140;
                  if (isHighResVideo || isPrimaryAudio) {
                    try {
                      ensureCdnPreconnect(new URL(fmt.url).origin);
                    } catch (err) {
                      // Ignore malformed URLs
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore
      }
      return parsed;
    };
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
                state.virtualBufferActive = false;
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
   * Injects <link rel="dns-prefetch"> and <link rel="preconnect"> tags for media CDN hosts
   * (V12 Async Warm-up pattern) to eliminate DNS/TCP/TLS/QUIC handshake latency on 4K chunks.
   * @param {string} origin
   */
  function ensureCdnPreconnect(origin) {
    if (!origin || state.preconnectedOrigins.has(origin) || !document.head) {
      return;
    }
    state.preconnectedOrigins.add(origin);
    try {
      const dnsLink = document.createElement('link');
      dnsLink.rel = 'dns-prefetch';
      dnsLink.href = origin;
      document.head.appendChild(dnsLink);

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

  let lastReportedVideoId = null;
  const reportedStreamsCache = new Set();

  /**
   * Pre-warms media CDN origins discovered via fetch or XMLHttpRequest (V12 hook pattern)
   * and dispatches active playback streams for 1-click video/audio downloading.
   * @param {string} urlStr
   */
  function inspectAndWarmMediaUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') {
      return;
    }
    if (urlStr.includes('googlevideo.com/videoplayback') || urlStr.includes('.m3u8')) {
      try {
        const parsedUrl = new URL(urlStr, window.location.origin);
        if (state.config.enabled && state.config.parallelPrefetch) {
          ensureCdnPreconnect(parsedUrl.origin);
        }

        // Active playback stream sniffer (captures deciphered playback requests)
        if (urlStr.includes('googlevideo.com/videoplayback')) {
          const itag = parsedUrl.searchParams.get('itag');
          const cleanUrl = urlStr
            .replace(/[?&]range=[^&]+/g, '')
            .replace(/[?&]rn=[^&]+/g, '')
            .replace(/[?&]rbuf=[^&]+/g, '')
            .replace(/[?&]sq=[^&]+/g, '');

          const cacheKey = `active_${state.lastVideoId || 'vid'}_${itag}`;
          if (itag && !reportedStreamsCache.has(cacheKey)) {
            reportedStreamsCache.add(cacheKey);
            const mime = parsedUrl.searchParams.get('mime') || '';
            const player = document.getElementById('movie_player');
            let rawTitle = document.title || 'YouTube_Video';
            if (player && typeof player.getVideoData === 'function') {
              try {
                const vd = player.getVideoData();
                if (vd && vd.title) {
                  rawTitle = vd.title;
                }
              } catch (e) {
                // Ignore
              }
            }
            rawTitle = rawTitle.replace(/\s*[-–|•]\s*YouTube.*$/i, '').trim();

            window.dispatchEvent(
              new CustomEvent('MQ4K_YOUTUBE_ACTIVE_STREAM', {
                detail: {
                  url: cleanUrl,
                  itag: itag,
                  mime: mime,
                  title: rawTitle
                }
              })
            );
          }
        }
      } catch (e) {
        // Ignore URL parse error
      }
    }
  }

  /**
   * Checks if a URL is a heavy main-thread YouTube diagnostic/logging endpoint
   * (Preserves /api/stats/watchtime, /ptracking, and /api/stats/atr for full YouTube playback & creator attribution compliance)
   * @param {string} urlStr
   * @returns {boolean}
   */
  function isHeavyTelemetryEndpoint(urlStr) {
    if (!state.config.enabled || typeof urlStr !== 'string') {
      return false;
    }
    if (
      urlStr.includes('/api/stats/watchtime') ||
      urlStr.includes('/ptracking') ||
      urlStr.includes('/api/stats/atr')
    ) {
      return false;
    }
    return (
      urlStr.includes('/youtubei/v1/log_event') ||
      urlStr.includes('/api/stats/qoe')
    );
  }

  /**
   * PILAR 3.3 & PILAR 4.2: Hooks window.fetch, XMLHttpRequest.prototype.open (V12 pattern),
   * and navigator.sendBeacon for:
   * - Automatic CDN origin pre-warming across both Fetch and XHR pipelines
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

    if (typeof window.XMLHttpRequest !== 'undefined' && window.XMLHttpRequest.prototype) {
      const originalXhrOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        try {
          const urlStr = typeof url === 'string' ? url : url ? String(url) : '';
          inspectAndWarmMediaUrl(urlStr);
        } catch (e) {
          // Never interrupt XHR open
        }
        return originalXhrOpen.apply(this, arguments);
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

      inspectAndWarmMediaUrl(urlStr);

      return originalFetch(input, init);
    };
  }

  /**
   * Calculates real buffered time ahead of current playback position
   * @param {HTMLVideoElement} video
   * @returns {{ bufferAhead: number, nextGapStart: number | null }}
   */
  function analyzeVideoBuffer(video) {
    if (!video || !video.buffered || video.buffered.length === 0) {
      return { bufferAhead: 0, nextGapStart: null };
    }

    const ranges = video.buffered;
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
   * Proactively wakes YouTube's internal SABR/DASH loader when real buffer ahead
   * is below the user's selected targetBufferSec (60s / 120s / 180s).
   * @param {HTMLVideoElement | null} video
   */
  function pumpYouTubePreBufferLoader(video) {
    if (!state.config.enabled || !state.config.deepPreBuffer || !video || video.ended || video.seeking) {
      return;
    }

    const now = Date.now();
    if (state.mseQuotaWarning && now < state.mseQuotaWarningUntil) {
      return;
    }
    if (state.mseQuotaWarning && now >= state.mseQuotaWarningUntil) {
      state.mseQuotaWarning = false;
    }

    const targetSec = getTargetBufferSeconds();
    if (state.realBufferAheadSec >= targetSec) {
      state.bufferGoalReached = true;
      state.virtualBufferActive = false;
      return;
    }

    state.bufferGoalReached = false;

    try {
      // Clear any lingering SABR backoff timestamp (this.K) when buffer is below target
      if (state.activeSabrCoordinator && typeof state.activeSabrCoordinator === 'object') {
        const coord = state.activeSabrCoordinator;
        if (coord.A && typeof coord.A === 'object') {
          const targetMs = targetSec * 1000;
          coord.A.targetVideoReadaheadMs = Math.max(Number(coord.A.targetVideoReadaheadMs) || 0, targetMs);
          coord.A.targetAudioReadaheadMs = Math.max(Number(coord.A.targetAudioReadaheadMs) || 0, targetMs);
        }
      }

      if (state.activeYtLoader && typeof state.activeYtLoader.mf === 'function') {
        state.activeYtLoader.mf();
      }
    } catch (e) {
      // Ignore internal loader exceptions
    }
  }

  /**
   * Periodic Monitor Loop: Evaluates player state, real buffer health, pumps SABR
   * pre-buffering, checks frame drops, and dispatches metrics to Popup & Service Worker.
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
      lastReportedVideoId = currentVideoId;
      reportedStreamsCache.clear();
      state.qualityAppliedForVideo = null;
      state.dropGuardTriggered = false;
      state.bufferGoalReached = false;
      state.mseQuotaWarning = false;
      seedYouTubeQualityStorage(state.config.targetQuality);
    }

    const bufferInfo = analyzeVideoBuffer(video);
    state.realBufferAheadSec = bufferInfo.bufferAhead;

    pumpYouTubePreBufferLoader(video);
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
      videoMimeType:
        state.activeMimeTypes.video && state.activeMimeTypes.video !== 'unknown'
          ? state.activeMimeTypes.video
          : (video && video.currentSrc ? video.currentSrc : 'video/webm; codecs="vp09.00.41.08"'),
      audioMimeType:
        state.activeMimeTypes.audio && state.activeMimeTypes.audio !== 'unknown'
          ? state.activeMimeTypes.audio
          : 'audio/webm; codecs="opus"',
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
    extractYouTubeDownloadableStreams();
  }

  /**
   * Scans YouTube player response and streamingData for progressive muxed MP4s
   * (audio + video), high-res adaptive streams (1080p, 1440p, 2160p 4K), and audio tracks.
   */
  function extractYouTubeDownloadableStreams() {
    const player = document.getElementById('movie_player');
    let pr = null;
    if (player && typeof player.getPlayerResponse === 'function') {
      try {
        pr = player.getPlayerResponse();
      } catch (e) {
        // Ignore
      }
    }
    if (!pr && window.ytInitialPlayerResponse) {
      pr = window.ytInitialPlayerResponse;
    }
    if (!pr || !pr.streamingData) {
      return;
    }

    const videoDetails = pr.videoDetails || {};
    let rawTitle = videoDetails.title || document.title || 'YouTube_Video';
    rawTitle = rawTitle.replace(/\s*[-–|•]\s*YouTube.*$/i, '').trim();

    const videoId = videoDetails.videoId || state.lastVideoId || '';
    if (videoId && videoId !== lastReportedVideoId) {
      lastReportedVideoId = videoId;
      reportedStreamsCache.clear();
    }

    const sd = pr.streamingData;
    const detected = [];

    function cleanUrl(u) {
      if (!u || typeof u !== 'string') return '';
      return u
        .replace(/[?&]range=[^&]+/g, '')
        .replace(/[?&]rn=[^&]+/g, '')
        .replace(/[?&]rbuf=[^&]+/g, '')
        .replace(/[?&]sq=[^&]+/g, '');
    }

    // 1. Progressive muxed MP4 formats (Audio + Video in a single file)
    if (Array.isArray(sd.formats)) {
      for (let i = 0; i < sd.formats.length; i += 1) {
        const fmt = sd.formats[i];
        if (fmt && fmt.url) {
          const streamUrl = cleanUrl(fmt.url);
          const q = fmt.qualityLabel || (fmt.height ? `${fmt.height}p` : '720p');
          const cacheKey = `${videoId}_${fmt.itag || q}`;
          if (!reportedStreamsCache.has(cacheKey)) {
            reportedStreamsCache.add(cacheKey);
            detected.push({
              url: streamUrl,
              title: `${rawTitle} [${q}]`,
              label: `YouTube MP4 (${q} - Áudio + Vídeo)`,
              quality: q,
              type: 'mp4',
              ext: 'mp4',
              isMuxed: true
            });
          }
        }
      }
    }

    // 2. High-resolution adaptive formats (1080p, 1440p, 2160p 4K, Audio)
    if (Array.isArray(sd.adaptiveFormats)) {
      for (let i = 0; i < sd.adaptiveFormats.length; i += 1) {
        const fmt = sd.adaptiveFormats[i];
        if (fmt && fmt.url) {
          const streamUrl = cleanUrl(fmt.url);
          const mime = (fmt.mimeType || '').toLowerCase();
          const isVideo = mime.startsWith('video/');
          const isAudio = mime.startsWith('audio/');
          const isWebm = mime.includes('webm');
          const ext = isWebm ? 'webm' : (isVideo ? 'mp4' : 'm4a');

          if (isVideo && (fmt.height >= 720 || fmt.itag === 313 || fmt.itag === 315 || fmt.itag === 271 || fmt.itag === 137)) {
            const q = fmt.qualityLabel || (fmt.height ? `${fmt.height}p` : 'HD');
            const cacheKey = `${videoId}_${fmt.itag || q}`;
            if (!reportedStreamsCache.has(cacheKey)) {
              reportedStreamsCache.add(cacheKey);
              detected.push({
                url: streamUrl,
                title: `${rawTitle} [${q}]`,
                label: `YouTube ${q} (${ext.toUpperCase()} - Vídeo)`,
                quality: q,
                type: ext,
                ext: ext,
                isMuxed: false
              });
            }
          } else if (isAudio && (fmt.itag === 140 || fmt.itag === 251)) {
            const cacheKey = `${videoId}_audio_${fmt.itag}`;
            if (!reportedStreamsCache.has(cacheKey)) {
              reportedStreamsCache.add(cacheKey);
              const audioLabel = fmt.itag === 140 ? 'M4A / AAC (128k)' : 'Opus / WebM (160k)';
              detected.push({
                url: streamUrl,
                title: `${rawTitle} [Audio]`,
                label: `YouTube Áudio (${audioLabel})`,
                quality: 'Audio',
                type: ext,
                ext: ext,
                isMuxed: false
              });
            }
          }
        }
      }
    }

    // 3. HLS Livestream
    if (sd.hlsManifestUrl) {
      const cacheKey = `${videoId}_live_hls`;
      if (!reportedStreamsCache.has(cacheKey)) {
        reportedStreamsCache.add(cacheKey);
        detected.push({
          url: sd.hlsManifestUrl,
          title: `${rawTitle} [Live]`,
          label: 'YouTube Live Stream (HLS .m3u8)',
          quality: 'Live',
          type: 'hls',
          ext: 'mp4'
        });
      }
    }

    if (detected.length > 0) {
      window.dispatchEvent(
        new CustomEvent('MQ4K_YOUTUBE_MEDIA_FOUND', {
          detail: {
            videoId: videoId,
            title: rawTitle,
            streams: detected
          }
        })
      );
    }
  }

  // Listen for configuration updates from the ISOLATED world content-controller
  window.addEventListener('MQ4K_CONFIG_SYNC', function (event) {
    if (event && event.detail && typeof event.detail === 'object') {
      const prevTarget = state.config.targetQuality;
      const prevBuffer = state.config.targetBufferSec;
      state.config = Object.assign({}, DEFAULT_CONFIG, event.detail);
      optimizePlayerDOM();
      seedYouTubeQualityStorage(state.config.targetQuality);

      if (prevBuffer !== state.config.targetBufferSec) {
        state.bufferGoalReached = false;
      }

      if (prevTarget !== state.config.targetQuality) {
        state.dropGuardTriggered = false;
        state.qualityAppliedForVideo = null;
        const player = document.getElementById('movie_player');
        enforcePlayerQuality(player, true);
      }

      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      pumpYouTubePreBufferLoader(video);
    }
  });

  // Listen for manual quality & live configuration enforcement requests from Popup (zero page reload)
  window.addEventListener('MQ4K_FORCE_QUALITY_NOW', function (event) {
    const player = document.getElementById('movie_player');
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

    let codecOrFpsChanged = false;
    let qualityChanged = false;

    if (event && event.detail && typeof event.detail === 'object') {
      const nextCfg = Object.assign({}, DEFAULT_CONFIG, event.detail);
      codecOrFpsChanged =
        nextCfg.blockAV1 !== state.config.blockAV1 ||
        nextCfg.blockHDR60 !== state.config.blockHDR60 ||
        nextCfg.block60fps !== state.config.block60fps;
      qualityChanged = nextCfg.targetQuality !== state.config.targetQuality;
      state.config = nextCfg;
    }

    state.dropGuardTriggered = false;
    state.bufferGoalReached = false;
    state.mseQuotaWarning = false;
    state.qualityAppliedForVideo = null;

    optimizePlayerDOM();
    seedYouTubeQualityStorage(state.config.targetQuality);
    enforcePlayerQuality(player, true);

    // Hot-reload stream at current timestamp without reloading the page when codec/FPS or quality changed
    try {
      if (player && video && !video.ended && (codecOrFpsChanged || qualityChanged)) {
        const currentPos = video.currentTime || 0;
        if (typeof player.seekTo === 'function' && currentPos > 0.1) {
          player.seekTo(currentPos, true);
        }
      }
    } catch (e) {
      // Ignore seek errors
    }

    pumpYouTubePreBufferLoader(video);
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

  // Bootstrap all v2.1 engines immediately at document_start
  installNetworkInfoSpoof();
  seedYouTubeQualityStorage(state.config.targetQuality);
  installCodecHooks();
  installDeepPreBufferUnlocker();
  installMSEBufferHooks();
  installStreamAndBeaconHooks();

  // Hook YouTube SPA navigation events
  window.addEventListener('yt-navigate-start', function () {
    reportedStreamsCache.clear();
    lastReportedVideoId = null;
    seedYouTubeQualityStorage(state.config.targetQuality);
  });

  window.addEventListener('yt-navigate-finish', function () {
    seedYouTubeQualityStorage(state.config.targetQuality);
    setTimeout(runMonitorCycle, 150);
  });

  window.addEventListener('MQ4K_FORCE_MONITOR_CYCLE', function () {
    runMonitorCycle();
  });

  setInterval(runMonitorCycle, 650);
})();
