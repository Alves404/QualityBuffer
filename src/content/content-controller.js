/**
 * My Quality 4k v2.2 - Content Controller & V12 Media Downloader Bridge (ISOLATED World)
 *
 * Responsibilities:
 * 1. Bridges Chrome Extension APIs (chrome.storage, chrome.runtime) with the MAIN
 *    world Page Hook Engine (page-hook.js) via CustomEvents on YouTube.
 * 2. Detects <video> and <source> media streams across web pages and SPA route changes
 *    (V12 location.href watcher), excluding YouTube/googlevideo internal streams for CWS compliance.
 * 3. Executes 12-worker concurrent HLS (M3U8 / AES-128) downloads in the tab context
 *    so session cookies and signed CDN tokens are preserved natively.
 *
 * Assisted engineering by Gemini 4 Argon (Google Antigravity).
 * License: GPL-3.0
 */

(function () {
  'use strict';

  if (window.__MQ4K_CONTROLLER_INJECTED__) {
    return;
  }
  window.__MQ4K_CONTROLLER_INJECTED__ = true;

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

  let latestPlayerMetrics = null;
  const reportedUrls = new Set();
  let currentDownloader = null;
  let lastHref = window.location.href;

  /**
   * Safely checks whether the current extension execution context is still valid.
   * @returns {boolean}
   */
  function isExtensionContextValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  /**
   * Checks whether a hostname or URL belongs to YouTube / GoogleVideo
   * @param {string} urlOrHost
   * @returns {boolean}
   */
  function isYouTubeDomain(urlOrHost) {
    if (!urlOrHost || typeof urlOrHost !== 'string') {
      return false;
    }
    const lower = urlOrHost.toLowerCase();
    return (
      lower.includes('youtube.com') ||
      lower.includes('youtu.be') ||
      lower.includes('googlevideo.com')
    );
  }

  /**
   * Dispatches configuration state to the MAIN world Page Hook Engine
   * @param {object} config
   */
  function syncConfigToMainWorld(config) {
    try {
      const merged = Object.assign({}, DEFAULT_CONFIG, config || {});
      window.dispatchEvent(new CustomEvent('MQ4K_CONFIG_SYNC', { detail: merged }));
    } catch (e) {
      // Ignore event dispatch errors
    }
  }

  /**
   * Loads saved configuration from chrome.storage.local on startup
   */
  function initializeConfig() {
    if (!isExtensionContextValid() || !chrome.storage || !chrome.storage.local) {
      syncConfigToMainWorld(DEFAULT_CONFIG);
      return;
    }

    try {
      chrome.storage.local.get(['mq4k_config'], function (result) {
        if (!isExtensionContextValid() || chrome.runtime.lastError) {
          syncConfigToMainWorld(DEFAULT_CONFIG);
          return;
        }
        const savedConfig = result && result.mq4k_config ? result.mq4k_config : DEFAULT_CONFIG;
        syncConfigToMainWorld(savedConfig);
      });
    } catch (e) {
      syncConfigToMainWorld(DEFAULT_CONFIG);
    }
  }

  // Listen for storage updates triggered from Popup UI
  if (isExtensionContextValid() && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (!isExtensionContextValid()) {
          return;
        }
        if (areaName === 'local' && changes && changes.mq4k_config && changes.mq4k_config.newValue) {
          syncConfigToMainWorld(changes.mq4k_config.newValue);
        }
      });
    } catch (e) {
      // Ignore if context was invalidated
    }
  }

  /**
   * Handles real-time playback metrics from the MAIN world Page Hook Engine.
   * @param {CustomEvent} event
   */
  function handlePlayerMetrics(event) {
    if (!isExtensionContextValid()) {
      return;
    }

    if (event && event.detail) {
      latestPlayerMetrics = event.detail;
      try {
        chrome.runtime.sendMessage(
          {
            type: 'MQ4K_PLAYER_TELEMETRY',
            payload: latestPlayerMetrics
          },
          function () {
            try {
              if (chrome && chrome.runtime) {
                void chrome.runtime.lastError;
              }
            } catch (err) {
              // Ignore
            }
          }
        );
      } catch (e) {
        // Keep listening across transient service-worker disconnects
      }
    }
  }

  window.addEventListener('MQ4K_PLAYER_METRICS', handlePlayerMetrics);

  // Note: YouTube stream detection listeners disabled for Chrome Web Store policy compliance.

  // =========================================================================
  // Web Video & V12 HLS Downloader Detection (Non-YouTube Pages)
  // =========================================================================

  /**
   * Extracts a clean, user-friendly video or lesson title from the video element or page.
   * @param {HTMLVideoElement | null} videoElement
   * @returns {string}
   */
  function extractVideoTitle(videoElement) {
    let title = '';
    if (videoElement) {
      title =
        videoElement.getAttribute('title') ||
        videoElement.getAttribute('aria-label') ||
        '';
    }
    if (!title && document.title) {
      title = document.title;
    }
    title = title.replace(/^\(\d+\)\s*/, '').replace(/\s*[-–|•]\s*.*$/, '').trim();
    return title || 'Video_Stream';
  }

  /**
   * Notifies the Background Service Worker about a newly discovered media URL.
   * Applies V12 anti-pollution filters (ignores .ts, .m4s, seg-, chunklist, blob:).
   * @param {string} url
   * @param {HTMLVideoElement | null} [videoEl=null]
   * @param {boolean} [isExclusiveFeed=false]
   */
  function notifyMediaFound(url, videoEl = null, isExclusiveFeed = false) {
    if (!isExtensionContextValid() || !url || typeof url !== 'string') {
      return;
    }
    if (url.startsWith('blob:') && !url.includes('.m3u8')) {
      return;
    }

    const lower = url.toLowerCase();
    // Exclude YouTube domains from media detection to comply with Chrome Web Store policies
    try {
      const host = window.location.hostname.toLowerCase();
      if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
        return;
      }
    } catch (_) {}

    if (
      lower.includes('.ts') ||
      lower.includes('.m4s') ||
      lower.includes('seg-') ||
      lower.includes('fragment') ||
      lower.includes('chunklist')
    ) {
      return;
    }

    if (isExclusiveFeed) {
      reportedUrls.clear();
    }

    const cleanKey = url.split('?')[0];
    if (reportedUrls.has(cleanKey)) {
      return;
    }
    reportedUrls.add(cleanKey);

    const title = extractVideoTitle(videoEl);

    try {
      chrome.runtime.sendMessage(
        {
          action: 'MEDIA_DETECTED_FROM_PAGE',
          url: url,
          title: title,
          isExclusiveFeed: isExclusiveFeed
        },
        function () {
          try {
            if (chrome && chrome.runtime) {
              void chrome.runtime.lastError;
            }
          } catch (err) {
            // Ignore
          }
        }
      );
    } catch (e) {
      // Ignore context invalidation
    }
  }

  /**
   * Checks whether the current page is a continuous vertical feed (TikTok, Reels, Shorts, etc.)
   * @returns {boolean}
   */
  function isFeedPage() {
    try {
      const host = (window.location.hostname || '').toLowerCase();
      const href = (window.location.href || '').toLowerCase();
      return (
        host.includes('tiktok.com') ||
        host.includes('instagram.com') ||
        href.includes('youtube.com/shorts') ||
        host.includes('twitter.com') ||
        host.includes('x.com')
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Finds the single video element currently visible and active in the user's viewport.
   * On feeds like TikTok / Reels / Shorts, this discards all background preloaded videos.
   * @returns {HTMLVideoElement | null}
   */
  function findActiveViewportVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) {
      return null;
    }
    if (videos.length === 1) {
      return videos[0];
    }

    // 1. Prioritize a video that is currently playing and not ended
    const playing = videos.filter(function (v) {
      return !v.paused && !v.ended && v.readyState >= 2;
    });
    if (playing.length === 1) {
      return playing[0];
    }

    // 2. Select the video with the largest visible intersection area with viewport center
    const vpWidth = window.innerWidth || document.documentElement.clientWidth || 800;
    const vpHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    const vpCenterX = vpWidth / 2;
    const vpCenterY = vpHeight / 2;

    let bestVideo = null;
    let bestScore = -1;

    const candidateList = playing.length > 0 ? playing : videos;

    candidateList.forEach(function (v) {
      const rect = v.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, vpWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, vpHeight) - Math.max(rect.top, 0));
      const visibleArea = visibleWidth * visibleHeight;

      if (visibleArea <= 0) {
        return;
      }

      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const distFromCenter = Math.hypot(centerX - vpCenterX, centerY - vpCenterY);
      const score = visibleArea / (1 + distFromCenter);

      if (score > bestScore) {
        bestScore = score;
        bestVideo = v;
      }
    });

    return bestVideo || candidateList[0] || videos[0];
  }

  /**
   * Inspects a <video> element and its <source> children for downloadable streams.
   * @param {HTMLVideoElement} video
   * @param {boolean} [isExclusiveFeed=false]
   */
  function inspectVideoElement(video, isExclusiveFeed = false) {
    if (!video) {
      return;
    }

    if (video.src) {
      notifyMediaFound(video.src, video, isExclusiveFeed);
    }
    if (video.currentSrc) {
      notifyMediaFound(video.currentSrc, video, isExclusiveFeed);
    }

    const sources = video.querySelectorAll('source');
    sources.forEach(function (srcEl) {
      if (srcEl.src) {
        notifyMediaFound(srcEl.src, video, isExclusiveFeed);
      }
    });
  }

  /**
   * Scans <video> elements in the DOM. On feed sites (TikTok, Reels, Shorts),
   * only inspects the active video currently visible on the screen.
   */
  function scanPageVideos() {
    if (isYouTubeDomain(window.location.hostname)) {
      return;
    }
    const videos = document.querySelectorAll('video');
    if (videos.length === 0) {
      return;
    }

    if (isFeedPage() || videos.length > 1) {
      const activeVid = findActiveViewportVideo();
      if (activeVid) {
        inspectVideoElement(activeVid, true);
      }
    } else {
      videos.forEach(function (v) {
        inspectVideoElement(v, false);
      });
    }
  }

  if (!isYouTubeDomain(window.location.hostname)) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanPageVideos);
    } else {
      scanPageVideos();
    }

    document.addEventListener(
      'play',
      function (e) {
        if (e.target && e.target.tagName === 'VIDEO') {
          const isExclusive = isFeedPage() || document.querySelectorAll('video').length > 1;
          inspectVideoElement(e.target, isExclusive);
        }
      },
      true
    );

    document.addEventListener(
      'loadedmetadata',
      function (e) {
        if (e.target && e.target.tagName === 'VIDEO') {
          const isExclusive = isFeedPage() || document.querySelectorAll('video').length > 1;
          inspectVideoElement(e.target, isExclusive);
        }
      },
      true
    );

    let scrollTimeout = null;
    window.addEventListener(
      'scroll',
      function () {
        if (isFeedPage()) {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(scanPageVideos, 180);
        }
      },
      { passive: true }
    );

    const observer = new MutationObserver(function (mutations) {
      for (let m = 0; m < mutations.length; m += 1) {
        const added = mutations[m].addedNodes;
        for (let n = 0; n < added.length; n += 1) {
          const node = added[n];
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO' || (node.querySelectorAll && node.querySelectorAll('video').length > 0)) {
              scanPageVideos();
              return;
            }
          }
        }
      }
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    // V12 SPA Navigation Watcher: clears stale media list when lesson/route URL changes without reload
    setInterval(function () {
      if (!isExtensionContextValid()) {
        return;
      }
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        reportedUrls.clear();
        if (window === window.top) {
          try {
            chrome.runtime.sendMessage({ action: 'RESET_TAB_MEDIA' }, function () {
              try {
                if (chrome && chrome.runtime) {
                  void chrome.runtime.lastError;
                }
              } catch (err) {}
            });
          } catch (e) {}
        }
        setTimeout(scanPageVideos, 300);
      }
    }, 1000);
  }

  // Listen for direct commands from Popup UI (both 4K Controls and HLS Downloader)
  if (isExtensionContextValid() && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (!isExtensionContextValid() || !message || typeof message !== 'object') {
          return false;
        }

        if (message.type === 'MQ4K_GET_TAB_METRICS') {
          try {
            window.dispatchEvent(new CustomEvent('MQ4K_FORCE_MONITOR_CYCLE'));
          } catch (e) {}

          const video = findActiveViewportVideo() || document.querySelector('video.html5-main-video') || document.querySelector('video');
          let metrics = latestPlayerMetrics;

          if (video) {
            const w = video.videoWidth || 0;
            const h = video.videoHeight || 0;
            const res = (w > 0 && h > 0) ? `${w}x${h}` : (metrics && metrics.resolution !== 'N/A' ? metrics.resolution : 'N/A');
            const currentPos = video.currentTime || 0;
            let bufAhead = 0;
            if (video.buffered && video.buffered.length > 0) {
              for (let b = 0; b < video.buffered.length; b += 1) {
                if (video.buffered.start(b) <= currentPos && currentPos <= video.buffered.end(b)) {
                  bufAhead = video.buffered.end(b) - currentPos;
                  break;
                }
              }
              if (bufAhead === 0 && currentPos === 0 && video.buffered.end(0) > 0) {
                bufAhead = video.buffered.end(0);
              }
            }

            const guessedQuality = h >= 2160 ? 'hd2160' : h >= 1440 ? 'hd1440' : h >= 1080 ? 'hd1080' : h >= 720 ? 'hd720' : (metrics && metrics.currentQuality ? metrics.currentQuality : 'auto');

            metrics = {
              hasActiveVideo: true,
              isPaused: video.paused,
              resolution: res,
              currentQuality: guessedQuality,
              videoMimeType: (metrics && metrics.videoMimeType && metrics.videoMimeType !== 'unknown') ? metrics.videoMimeType : 'video/webm; codecs="vp09.00.41.08"',
              bufferAheadSec: Number(bufAhead.toFixed(1)),
              targetBufferSec: (metrics && metrics.targetBufferSec) ? metrics.targetBufferSec : 120
            };
            latestPlayerMetrics = metrics;
          } else if (!metrics) {
            metrics = {
              hasActiveVideo: false,
              isPaused: true,
              resolution: 'N/A',
              currentQuality: 'Auto',
              videoMimeType: 'unknown',
              bufferAheadSec: 0,
              targetBufferSec: 120
            };
          }

          sendResponse({
            ok: true,
            metrics: metrics
          });
          return true;
        }

        if (message.type === 'MQ4K_FORCE_QUALITY') {
          if (message.config && typeof message.config === 'object') {
            syncConfigToMainWorld(message.config);
          }
          window.dispatchEvent(
            new CustomEvent('MQ4K_FORCE_QUALITY_NOW', {
              detail: message.config || null
            })
          );
          sendResponse({ ok: true });
          return true;
        }

        if (message.action === 'PING_CONTENT_SCRIPT') {
          sendResponse({ ready: true, title: document.title });
          return true;
        }

        if (message.action === 'START_HLS_DOWNLOAD') {
          // Only execute the download inside the top frame to avoid duplicate frame triggers
          if (window !== window.top) {
            return false;
          }

          const url = message.url;
          const title = message.title;
          const format = message.format || 'mp4';

          if (currentDownloader && currentDownloader.isDownloading) {
            sendResponse({
              success: false,
              error: 'A download is already in progress in this tab.'
            });
            return true;
          }

          if (typeof HLSDownloader === 'undefined') {
            sendResponse({
              success: false,
              error: 'HLS Downloader engine is not loaded. Please refresh the page.'
            });
            return true;
          }

          currentDownloader = new HLSDownloader({ concurrency: 12 });

          currentDownloader
            .download(
              url,
              title || document.title,
              function (progress) {
                if (!isExtensionContextValid()) {
                  return;
                }
                chrome.runtime.sendMessage({
                  action: 'HLS_DOWNLOAD_PROGRESS',
                  url: url,
                  progress: progress
                });
              },
              format
            )
            .then(function (result) {
              if (!isExtensionContextValid()) {
                return;
              }
              chrome.runtime.sendMessage({
                action: 'HLS_DOWNLOAD_COMPLETE',
                url: url,
                result: result
              });
            })
            .catch(function (err) {
              if (!isExtensionContextValid()) {
                return;
              }
              chrome.runtime.sendMessage({
                action: 'HLS_DOWNLOAD_ERROR',
                url: url,
                error: err.message
              });
            });

          sendResponse({ success: true, started: true });
          return true;
        }

        if (message.action === 'CANCEL_HLS_DOWNLOAD') {
          if (currentDownloader) {
            currentDownloader.abort();
            currentDownloader = null;
          }
          sendResponse({ success: true, cancelled: true });
          return true;
        }

        return false;
      });
    } catch (e) {
      // Ignore
    }
  }

  initializeConfig();
})();
