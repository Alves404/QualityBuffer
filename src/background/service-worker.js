/**
 * My Quality 4k v2.2 - Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * 1. Passive googlevideo.com chunk monitor for real-time 4K bandwidth throughput (Mbps)
 *    and CDN node latency (ms) in the Popup dashboard.
 * 2. Web Video & HLS (.m3u8 / .mp4 / .webm) network detector and per-tab media store
 *    with V12 anti-pollution filtering and direct file download support.
 *
 * Assisted engineering by Gemini 4 Argon (Google Antigravity).
 * License: GPL-3.0
 */

'use strict';

try {
  importScripts('../core/utils.js');
} catch (e) {
  // Ignore if unavailable in worker scope
}

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

/**
 * Known YouTube itag definitions for stream diagnostics
 */
const ITAG_MAP = {
  '313': '2160p (4K) VP9 30fps SDR',
  '315': '2160p (4K) VP9 60fps SDR',
  '308': '1440p (2K) VP9 60fps SDR',
  '271': '1440p (2K) VP9 30fps SDR',
  '248': '1080p VP9 30fps SDR',
  '303': '1080p VP9 60fps SDR',
  '137': '1080p H.264 30fps',
  '299': '1080p H.264 60fps',
  '247': '720p VP9 30fps',
  '302': '720p VP9 60fps',
  '136': '720p H.264 30fps',
  '337': '2160p (4K) VP9 Profile 2 HDR',
  '336': '1440p (2K) VP9 Profile 2 HDR',
  '401': '2160p (4K) AV1',
  '400': '1440p (2K) AV1',
  '399': '1080p AV1',
  '251': 'Audio WebM Opus (160kbps)',
  '140': 'Audio MP4 AAC (128kbps)'
};

const MAX_LOG_ENTRIES = 60;
const inFlightRequests = new Map();
const networkLogs = [];
const tabMediaStore = new Map();
const tabTelemetryStore = new Map();
const tabFeedExclusive = new Set();

let activeConfig = Object.assign({}, DEFAULT_CONFIG);
let latestPlayerTelemetry = null;

const networkSummary = {
  totalChunks: 0,
  totalBytes: 0,
  failedChunks: 0,
  avgThroughputMbps: 0,
  peakThroughputMbps: 0,
  avgLatencyMs: 0,
  lastCdnHost: 'N/A',
  lastItag: 'N/A',
  lastItagDescription: 'Awaiting stream...'
};

/**
 * Loads configuration from chrome.storage.local and initializes defaults if absent
 */
function loadConfiguration() {
  chrome.storage.local.get(['mq4k_config'], function (result) {
    if (result && result.mq4k_config) {
      activeConfig = Object.assign({}, DEFAULT_CONFIG, result.mq4k_config);
    } else {
      chrome.storage.local.set({ mq4k_config: DEFAULT_CONFIG });
    }
    updateToolbarBadge();
  });
}

/**
 * Ensures toolbar icon uses the latest assets from the extension bundle
 */
function applyToolbarIcon() {
  if (chrome.action && chrome.action.setIcon) {
    try {
      chrome.action.setIcon({
        path: {
          16: '/assets/icons/icon16.png',
          32: '/assets/icons/icon32.png',
          48: '/assets/icons/icon48.png',
          128: '/assets/icons/icon128.png'
        }
      }, function () {
        if (chrome.runtime.lastError) {
          // Silently ignore if already active or context closed
        }
      });
    } catch (_) {}
  }
}

/**
 * Updates Chrome extension toolbar badge globally or for a specific tab
 * @param {number} [tabId]
 */
function updateToolbarBadge(tabId) {
  if (!chrome.action) {
    return;
  }

  if (typeof tabId === 'number' && tabId >= 0) {
    chrome.action.setBadgeText({ text: '', tabId: tabId });
    return;
  }

  chrome.action.setBadgeText({ text: '' });
}

// ============================================================================
// Web Video & HLS Stream Detection (Non-YouTube Pages)
// ============================================================================

/**
 * Classifies a media URL or Content-Type into HLS (.m3u8), MP4, WebM, or YouTube stream.
 * Filters out individual TS/M4S fragments and secondary chunklists (V12 filter).
 * @param {string} url
 * @param {string} [contentType=""]
 */
function classifyMedia(url, contentType = '') {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const lowerUrl = url.toLowerCase();
  const lowerType = (contentType || '').toLowerCase();

  // Active stream classification for YouTube/GoogleVideo media
  if (lowerUrl.includes('googlevideo.com/videoplayback')) {
    try {
      const u = new URL(url);
      const itag = u.searchParams.get('itag');
      const mime = u.searchParams.get('mime') || contentType;
      const itagInfo = typeof DownloaderUtils !== 'undefined' && DownloaderUtils.classifyYouTubeItag
        ? DownloaderUtils.classifyYouTubeItag(itag, mime)
        : null;

      if (itagInfo) {
        return {
          type: itagInfo.ext,
          label: itagInfo.label,
          ext: itagInfo.ext,
          quality: itagInfo.quality,
          isMuxed: itagInfo.isMuxed
        };
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
    return {
      type: 'mp4',
      label: 'Direct Stream (MP4)',
      ext: 'mp4'
    };
  }

  // Anti-pollution filters: exclude individual segments and manifest sub-chunks
  if (
    lowerUrl.includes('.ts') ||
    lowerUrl.includes('.m4s') ||
    lowerUrl.includes('seg-') ||
    lowerUrl.includes('fragment') ||
    lowerUrl.includes('chunklist')
  ) {
    return null;
  }

  if (lowerUrl.includes('.m3u8') || lowerType.includes('mpegurl')) {
    return {
      type: 'hls',
      label: 'HLS Stream (.m3u8)',
      ext: 'mp4'
    };
  }

  if (lowerUrl.includes('.mp4') || lowerType.includes('video/mp4')) {
    return {
      type: 'mp4',
      label: 'Direct Video (MP4)',
      ext: 'mp4'
    };
  }

  if (lowerUrl.includes('.webm') || lowerType.includes('video/webm')) {
    return {
      type: 'webm',
      label: 'Direct Video (WebM)',
      ext: 'webm'
    };
  }

  if (lowerType.startsWith('video/')) {
    return {
      type: 'video',
      label: 'Direct Video',
      ext: 'mp4'
    };
  }

  return null;
}

/**
 * Records a detected media stream for a given tabId and updates the tab badge.
 * @param {number} tabId
 * @param {string} rawUrl
 * @param {string} [source="network"]
 * @param {object} [extraInfo={}]
 */
function recordMedia(tabId, rawUrl, source = 'network', extraInfo = {}) {
  if (typeof tabId !== 'number' || tabId < 0 || !rawUrl) {
    return;
  }

  // Suppress background network media pollution if this tab is an exclusive feed (TikTok, Reels, Shorts)
  if (source === 'network' && tabFeedExclusive.has(tabId)) {
    return;
  }

  const classification = classifyMedia(rawUrl, extraInfo.contentType);
  if (!classification && !extraInfo.type) {
    return;
  }

  if (!tabMediaStore.has(tabId)) {
    tabMediaStore.set(tabId, new Map());
  }

  const mediaMap = tabMediaStore.get(tabId);
  const cleanUrl = typeof DownloaderUtils !== 'undefined' && DownloaderUtils.cleanStreamUrl
    ? DownloaderUtils.cleanStreamUrl(rawUrl)
    : rawUrl.replace(/[?&]range=[^&]+/g, '').replace(/[?&]rn=[^&]+/g, '').replace(/[?&]rbuf=[^&]+/g, '');

  const resolvedType = extraInfo.type || (classification ? classification.type : 'mp4');
  const resolvedLabel = extraInfo.label || (classification ? classification.label : 'Detected Video');
  const resolvedExt = extraInfo.ext || (classification ? classification.ext : 'mp4');
  const resolvedQuality = extraInfo.quality || (classification ? classification.quality : '');
  const isMuxed = Boolean(classification && classification.isMuxed);
  const isAudioStream = resolvedQuality === 'Audio' || resolvedExt === 'm4a';

  let urlKey = cleanUrl.split('?')[0];
  if (cleanUrl.includes('googlevideo.com')) {
    urlKey = 'googlevideo_active_stream';
  }

  if (mediaMap.has(urlKey)) {
    const existing = mediaMap.get(urlKey);
    if (extraInfo.title && (!existing.title || existing.title === 'Detected Video')) {
      existing.title = extraInfo.title;
    }
    if (isAudioStream) {
      if (!existing.audioUrl || resolvedExt === 'm4a') {
        existing.audioUrl = cleanUrl;
      }
    } else if (existing.quality === 'Audio' || isMuxed) {
      if (existing.quality === 'Audio' && !existing.audioUrl) {
        existing.audioUrl = existing.url;
      }
      existing.url = cleanUrl;
      existing.type = 'mp4';
      existing.ext = 'mp4';
      existing.label = resolvedLabel;
      existing.quality = resolvedQuality;
      existing.isMuxed = isMuxed;
    }
    return;
  }

  const mediaItem = {
    id: 'media_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    url: cleanUrl,
    audioUrl: isAudioStream ? cleanUrl : null,
    type: resolvedType === 'hls' ? 'hls' : 'mp4',
    label: resolvedLabel,
    ext: resolvedType === 'hls' ? 'mp4' : 'mp4',
    quality: resolvedQuality,
    isMuxed: isMuxed,
    source: source,
    title: extraInfo.title || 'Detected Video',
    timestamp: Date.now()
  };

  mediaMap.set(urlKey, mediaItem);
  updateToolbarBadge(tabId);
}

// ============================================================================
// YouTube 4K CDN Throughput & Latency Monitor
// ============================================================================

/**
 * Parses URL query parameters from a googlevideo.com videoplayback request
 * @param {string} rawUrl
 */
function parseGoogleVideoUrl(rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    const itag = urlObj.searchParams.get('itag') || 'unknown';
    const rangeParam = urlObj.searchParams.get('range') || '';
    const rn = urlObj.searchParams.get('rn') || '0';
    const rbuf = urlObj.searchParams.get('rbuf') || '0';
    const mime = urlObj.searchParams.get('mime') || '';

    let chunkBytes = 0;
    if (rangeParam.includes('-')) {
      const parts = rangeParam.split('-');
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        chunkBytes = end - start + 1;
      }
    }

    return {
      cdnHost: urlObj.hostname,
      itag,
      itagDescription: ITAG_MAP[itag] || `Stream itag=${itag}`,
      rangeParam,
      chunkBytes,
      requestNumber: rn,
      readaheadBufferMs: parseInt(rbuf, 10) || 0,
      mime
    };
  } catch (err) {
    return null;
  }
}

/**
 * Appends a completed or failed network log entry and recalculates summary statistics
 * @param {object} entry
 */
function recordNetworkLog(entry) {
  networkLogs.unshift(entry);
  if (networkLogs.length > MAX_LOG_ENTRIES) {
    networkLogs.pop();
  }

  if (entry.status === 'OK') {
    networkSummary.totalChunks += 1;
    networkSummary.totalBytes += entry.chunkBytes || 0;
    networkSummary.lastCdnHost = entry.cdnHost;
    if (entry.itag && entry.itag !== '251' && entry.itag !== '140') {
      networkSummary.lastItag = entry.itag;
      networkSummary.lastItagDescription = entry.itagDescription;
    }

    const validEntries = networkLogs.filter(function (item) {
      return item.status === 'OK' && item.throughputMbps > 0;
    });

    if (validEntries.length > 0) {
      const sumMbps = validEntries.reduce(function (acc, cur) {
        return acc + cur.throughputMbps;
      }, 0);
      const sumLatency = validEntries.reduce(function (acc, cur) {
        return acc + cur.durationMs;
      }, 0);

      networkSummary.avgThroughputMbps = Number((sumMbps / validEntries.length).toFixed(2));
      networkSummary.avgLatencyMs = Math.round(sumLatency / validEntries.length);

      if (entry.throughputMbps > networkSummary.peakThroughputMbps) {
        networkSummary.peakThroughputMbps = entry.throughputMbps;
      }
    }
  } else {
    networkSummary.failedChunks += 1;
  }
}

// Hook webRequest lifecycle for both googlevideo.com metrics and Web Video/HLS detection
if (chrome.webRequest) {
  const ytFilter = { urls: ['*://*.googlevideo.com/videoplayback*'] };

  chrome.webRequest.onBeforeRequest.addListener(function (details) {
    const parsed = parseGoogleVideoUrl(details.url);
    if (!parsed) {
      return;
    }

    inFlightRequests.set(details.requestId, {
      requestId: details.requestId,
      tabId: details.tabId,
      startTime: details.timeStamp || Date.now(),
      parsed
    });

    if (inFlightRequests.size > 200) {
      const oldestKey = inFlightRequests.keys().next().value;
      inFlightRequests.delete(oldestKey);
    }
  }, ytFilter);

  chrome.webRequest.onCompleted.addListener(
    function (details) {
      const tracked = inFlightRequests.get(details.requestId);
      inFlightRequests.delete(details.requestId);

      if (!tracked) {
        return;
      }

      const endTime = details.timeStamp || Date.now();
      const durationMs = Math.max(1, Math.round(endTime - tracked.startTime));
      let chunkBytes = tracked.parsed.chunkBytes || 0;

      if (chunkBytes === 0 && Array.isArray(details.responseHeaders)) {
        for (let i = 0; i < details.responseHeaders.length; i += 1) {
          const h = details.responseHeaders[i];
          if (h && h.name && h.name.toLowerCase() === 'content-length' && h.value) {
            const parsedLen = parseInt(h.value, 10);
            if (!isNaN(parsedLen) && parsedLen > 0) {
              chunkBytes = parsedLen;
              break;
            }
          }
        }
      }

      const durationSec = durationMs / 1000;
      const throughputMbps =
        chunkBytes > 0 ? Number(((chunkBytes * 8) / (durationSec * 1000000)).toFixed(2)) : 0;

      recordNetworkLog({
        id: details.requestId,
        timestamp: Date.now(),
        status: 'OK',
        statusCode: details.statusCode,
        cdnHost: tracked.parsed.cdnHost,
        itag: tracked.parsed.itag === 'unknown' ? 'SABR/4K' : tracked.parsed.itag,
        itagDescription:
          tracked.parsed.itag === 'unknown'
            ? 'SABR Multiplexed 4K Stream'
            : tracked.parsed.itagDescription,
        chunkBytes,
        chunkKB: Number((chunkBytes / 1024).toFixed(1)),
        durationMs,
        throughputMbps,
        readaheadBufferMs: tracked.parsed.readaheadBufferMs
      });
    },
    ytFilter,
    ['responseHeaders']
  );

  chrome.webRequest.onErrorOccurred.addListener(function (details) {
    const tracked = inFlightRequests.get(details.requestId);
    inFlightRequests.delete(details.requestId);

    if (!tracked) {
      return;
    }

    recordNetworkLog({
      id: details.requestId,
      timestamp: Date.now(),
      status: 'ERROR',
      error: details.error || 'UNKNOWN_NETWORK_ERROR',
      cdnHost: tracked.parsed.cdnHost,
      itag: tracked.parsed.itag,
      itagDescription: tracked.parsed.itagDescription,
      chunkBytes: tracked.parsed.chunkBytes,
      chunkKB: Number(((tracked.parsed.chunkBytes || 0) / 1024).toFixed(1)),
      durationMs: Math.max(1, Math.round((details.timeStamp || Date.now()) - tracked.startTime)),
      throughputMbps: 0,
      readaheadBufferMs: tracked.parsed.readaheadBufferMs
    });
  }, ytFilter);

  // Web Video & HLS (.m3u8 / .mp4 / .webm) detector across web pages
  chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      if (details.tabId < 0 || !details.url) {
        return;
      }

      // Reset tab media inventory on top-level page navigation without needing broad "tabs" permission
      if (details.type === 'main_frame' && details.frameId === 0) {
        tabMediaStore.delete(details.tabId);
        tabFeedExclusive.delete(details.tabId);
        updateToolbarBadge(details.tabId);
        return;
      }

      const lower = details.url.toLowerCase();
      if (
        lower.includes('.m3u8') ||
        lower.includes('.mp4') ||
        lower.includes('.webm') ||
        lower.includes('googlevideo.com/videoplayback')
      ) {
        recordMedia(details.tabId, details.url, 'network');
      }
    },
    { urls: ['<all_urls>'] }
  );

  chrome.webRequest.onHeadersReceived.addListener(
    function (details) {
      if (details.tabId >= 0 && Array.isArray(details.responseHeaders)) {
        for (let i = 0; i < details.responseHeaders.length; i += 1) {
          const h = details.responseHeaders[i];
          if (h && h.name && h.name.toLowerCase() === 'content-type' && h.value) {
            const ct = h.value.toLowerCase();
            if (ct.includes('video/') || ct.includes('mpegurl')) {
              recordMedia(details.tabId, details.url, 'network_headers', { contentType: ct });
            }
            break;
          }
        }
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
}

if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(function (tabId) {
    tabMediaStore.delete(tabId);
    tabTelemetryStore.delete(tabId);
    tabFeedExclusive.delete(tabId);
  });
}

// Listen for configuration changes
chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName === 'local' && changes.mq4k_config && changes.mq4k_config.newValue) {
    activeConfig = Object.assign({}, DEFAULT_CONFIG, changes.mq4k_config.newValue);
    updateToolbarBadge();
  }
});

// Listen for messages from Content Controller and Popup UI
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const senderTabId = sender && sender.tab ? sender.tab.id : message.tabId;

  if (message.type === 'MQ4K_PLAYER_TELEMETRY') {
    latestPlayerTelemetry = message.payload;
    if (typeof senderTabId === 'number' && senderTabId >= 0) {
      tabTelemetryStore.set(senderTabId, message.payload);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'MQ4K_GET_DASHBOARD_STATE') {
    const targetTabId = typeof message.tabId === 'number' ? message.tabId : senderTabId;
    const mediaMap = typeof targetTabId === 'number' ? tabMediaStore.get(targetTabId) : null;
    const mediaCount = mediaMap ? mediaMap.size : 0;
    const tabTelemetry = (typeof targetTabId === 'number' && tabTelemetryStore.has(targetTabId))
      ? tabTelemetryStore.get(targetTabId)
      : latestPlayerTelemetry;

    sendResponse({
      ok: true,
      config: activeConfig,
      playerTelemetry: tabTelemetry,
      mediaCount: mediaCount,
      networkSummary: Object.assign({}, networkSummary, {
        totalMB: Number((networkSummary.totalBytes / (1024 * 1024)).toFixed(2))
      })
    });
    return true;
  }

  if (message.action === 'MEDIA_DETECTED_FROM_PAGE') {
    if (typeof senderTabId === 'number' && senderTabId >= 0 && message.url) {
      if (message.isExclusiveFeed) {
        tabFeedExclusive.add(senderTabId);
        if (tabMediaStore.has(senderTabId)) {
          tabMediaStore.get(senderTabId).clear();
        }
      }
      recordMedia(senderTabId, message.url, 'page', {
        title: message.title || (sender && sender.tab && sender.tab.title),
        label: message.label,
        type: message.type,
        ext: message.ext,
        quality: message.quality
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'RESET_TAB_MEDIA') {
    if (typeof senderTabId === 'number' && senderTabId >= 0) {
      tabMediaStore.delete(senderTabId);
      tabFeedExclusive.delete(senderTabId);
      updateToolbarBadge(senderTabId);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'GET_TAB_MEDIA') {
    const targetTabId = message.tabId;
    const mediaMap = tabMediaStore.get(targetTabId);
    const list = mediaMap ? Array.from(mediaMap.values()) : [];
    sendResponse({ list: list });
    return true;
  }

  if (message.action === 'DOWNLOAD_DIRECT_FILE') {
    if (!chrome.downloads || typeof chrome.downloads.download !== 'function') {
      sendResponse({ success: false, error: 'Downloads API unavailable.' });
      return true;
    }

    let finalFilename = message.filename || 'video.mp4';
    if (message.format === 'mp3' && !finalFilename.toLowerCase().endsWith('.mp3')) {
      finalFilename = finalFilename.replace(/\.[a-z0-9]+$/i, '') + '.mp3';
    }

    chrome.downloads.download(
      {
        url: message.url,
        filename: finalFilename,
        saveAs: true
      },
      function (downloadId) {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId: downloadId });
        }
      }
    );
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(function () {
  loadConfiguration();
  applyToolbarIcon();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(function () {
    applyToolbarIcon();
  });
}

loadConfiguration();
applyToolbarIcon();
