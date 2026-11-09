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
      window.removeEventListener('MQ4K_PLAYER_METRICS', handlePlayerMetrics);
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
        window.removeEventListener('MQ4K_PLAYER_METRICS', handlePlayerMetrics);
      }
    }
  }

  window.addEventListener('MQ4K_PLAYER_METRICS', handlePlayerMetrics);

  // Listen for YouTube streams discovered by page-hook in MAIN execution world
  window.addEventListener('MQ4K_YOUTUBE_MEDIA_FOUND', function (event) {
    if (!isExtensionContextValid() || !event || !event.detail) {
      return;
    }
    const detail = event.detail;
    const streams = Array.isArray(detail.streams) ? detail.streams : [];
    for (let i = 0; i < streams.length; i += 1) {
      const item = streams[i];
      if (item && item.url) {
        try {
          chrome.runtime.sendMessage(
            {
              action: 'MEDIA_DETECTED_FROM_PAGE',
              url: item.url,
              title: item.title || detail.title || document.title,
              label: item.label,
              type: item.type,
              ext: item.ext,
              quality: item.quality
            },
            function () {
              try {
                if (chrome && chrome.runtime) {
                  void chrome.runtime.lastError;
                }
              } catch (err) {}
            }
          );
        } catch (e) {}
      }
    }
  });

  window.addEventListener('MQ4K_YOUTUBE_ACTIVE_STREAM', function (event) {
    if (!isExtensionContextValid() || !event || !event.detail) {
      return;
    }
    const item = event.detail;
    if (item && item.url) {
      try {
        const itagInfo = typeof DownloaderUtils !== 'undefined'
          ? DownloaderUtils.classifyYouTubeItag(item.itag, item.mime)
          : null;

        const resolvedLabel = itagInfo ? itagInfo.label : 'YouTube Stream';
        const resolvedExt = itagInfo ? itagInfo.ext : 'mp4';
        const resolvedType = itagInfo ? itagInfo.ext : 'mp4';
        const resolvedQuality = itagInfo ? itagInfo.quality : '';

        chrome.runtime.sendMessage(
          {
            action: 'MEDIA_DETECTED_FROM_PAGE',
            url: item.url,
            title: `${item.title || 'YouTube_Video'} [${resolvedQuality || item.itag}]`,
            label: resolvedLabel,
            type: resolvedType,
            ext: resolvedExt,
            quality: resolvedQuality
          },
          function () {
            try {
              if (chrome && chrome.runtime) {
                void chrome.runtime.lastError;
              }
            } catch (err) {}
          }
        );
      } catch (e) {}
    }
  });

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
    title = title.replace(/\s*[-–|•]\s*.*$/, '').trim();
    return title || 'Video_Stream';
  }

  /**
   * Notifies the Background Service Worker about a newly discovered media URL.
   * Applies V12 anti-pollution filters (ignores .ts, .m4s, seg-, chunklist, blob:).
   * @param {string} url
   * @param {HTMLVideoElement | null} [videoEl=null]
   */
  function notifyMediaFound(url, videoEl = null) {
    if (!isExtensionContextValid() || !url || typeof url !== 'string') {
      return;
    }
    if (url.startsWith('blob:') && !url.includes('.m3u8')) {
      return;
    }

    const lower = url.toLowerCase();
    if (
      lower.includes('.ts') ||
      lower.includes('.m4s') ||
      lower.includes('seg-') ||
      lower.includes('fragment') ||
      lower.includes('chunklist')
    ) {
      return;
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
          title: title
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
   * Inspects a <video> element and its <source> children for downloadable streams.
   * @param {HTMLVideoElement} video
   */
  function inspectVideoElement(video) {
    if (!video) {
      return;
    }

    if (video.src) {
      notifyMediaFound(video.src, video);
    }
    if (video.currentSrc) {
      notifyMediaFound(video.currentSrc, video);
    }

    const sources = video.querySelectorAll('source');
    sources.forEach(function (srcEl) {
      if (srcEl.src) {
        notifyMediaFound(srcEl.src, video);
      }
    });
  }

  /**
   * Scans all <video> elements currently in the DOM.
   */
  function scanPageVideos() {
    if (isYouTubeDomain(window.location.hostname)) {
      return;
    }
    const videos = document.querySelectorAll('video');
    videos.forEach(inspectVideoElement);
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
          inspectVideoElement(e.target);
        }
      },
      true
    );

    document.addEventListener(
      'loadedmetadata',
      function (e) {
        if (e.target && e.target.tagName === 'VIDEO') {
          inspectVideoElement(e.target);
        }
      },
      true
    );

    const observer = new MutationObserver(function (mutations) {
      for (let m = 0; m < mutations.length; m += 1) {
        const added = mutations[m].addedNodes;
        for (let n = 0; n < added.length; n += 1) {
          const node = added[n];
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO') {
              inspectVideoElement(node);
            } else if (node.querySelectorAll) {
              const vids = node.querySelectorAll('video');
              vids.forEach(inspectVideoElement);
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
          sendResponse({
            ok: true,
            metrics: latestPlayerMetrics
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
            .download(url, title || document.title, function (progress) {
              if (!isExtensionContextValid()) {
                return;
              }
              chrome.runtime.sendMessage({
                action: 'HLS_DOWNLOAD_PROGRESS',
                url: url,
                progress: progress
              });
            })
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
