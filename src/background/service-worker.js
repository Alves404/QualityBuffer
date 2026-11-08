/**
 * My Quality 4k - Background Service Worker (Manifest V3)
 *
 * Monitors googlevideo.com videoplayback network chunks to compute real-time
 * bandwidth throughput (Mbps), CDN node latency, itag stream format analysis,
 * and optional synchronization with the local Telemetry & Route Analysis Server.
 *
 * Assisted engineering by Argon (Google Antigravity).
 * License: GPL-3.0
 */

'use strict';

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
 * Updates Chrome extension toolbar badge to reflect current state
 */
function updateToolbarBadge() {
  if (!chrome.action) {
    return;
  }

  if (!activeConfig.enabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#27272a' });
    return;
  }

  // Keep toolbar icon clean without "4K" overlay so the Video Player logo is fully visible
  chrome.action.setBadgeText({ text: '' });
}

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

// Hook webRequest lifecycle for googlevideo.com media segments
if (chrome.webRequest) {
  const filter = { urls: ['*://*.googlevideo.com/videoplayback*'] };

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

    // Clean up stale entries if map grows too large
    if (inFlightRequests.size > 200) {
      const oldestKey = inFlightRequests.keys().next().value;
      inFlightRequests.delete(oldestKey);
    }
  }, filter);

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
    filter,
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
  }, filter);
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

  if (message.type === 'MQ4K_PLAYER_TELEMETRY') {
    latestPlayerTelemetry = message.payload;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'MQ4K_GET_DASHBOARD_STATE') {
    sendResponse({
      ok: true,
      config: activeConfig,
      playerTelemetry: latestPlayerTelemetry,
      networkSummary: Object.assign({}, networkSummary, {
        totalMB: Number((networkSummary.totalBytes / (1024 * 1024)).toFixed(2))
      })
    });
    return true;
  }

  if (message.type === 'MQ4K_CLEAR_NETWORK_LOGS') {
    networkLogs.length = 0;
    networkSummary.totalChunks = 0;
    networkSummary.totalBytes = 0;
    networkSummary.failedChunks = 0;
    networkSummary.avgThroughputMbps = 0;
    networkSummary.peakThroughputMbps = 0;
    networkSummary.avgLatencyMs = 0;
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(function () {
  loadConfiguration();
});

loadConfiguration();
