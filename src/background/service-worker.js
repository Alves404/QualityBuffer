/**
 * QualityBuffer v2.3.1 - Background Service Worker (Manifest V3)
 *
 * Conceived and architected by Joao Vitor Magalhaes Alves (@Alves404).
 *
 * Responsibilities:
 * 1. Synchronizes user playback configuration in chrome.storage.local.
 * 2. Maintains per-tab telemetry and external Web Video & HLS (.m3u8 / .mp4 / .webm)
 *    download store with zero background network interception hooks.
 *
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

const tabMediaStore = new Map();
const tabTelemetryStore = new Map();
const tabFeedExclusive = new Set();

let activeConfig = Object.assign({}, DEFAULT_CONFIG);
let latestPlayerTelemetry = null;

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
      chrome.action.setIcon(
        {
          path: {
            16: '/assets/icons/icon16.png',
            32: '/assets/icons/icon32.png',
            48: '/assets/icons/icon48.png',
            128: '/assets/icons/icon128.png'
          }
        },
        function () {
          if (chrome.runtime.lastError) {
            // Silently ignore if already active or context closed
          }
        }
      );
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
 * Classifies a media URL or Content-Type into HLS (.m3u8), MP4, or WebM.
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

  // Strict compliance with Chrome Web Store policies: exclude YouTube and GoogleVideo from downloader
  if (
    lowerUrl.includes('googlevideo.com') ||
    lowerUrl.includes('youtube.com') ||
    lowerUrl.includes('youtu.be')
  ) {
    return null;
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
 * Records a detected media stream for a given tabId.
 * @param {number} tabId
 * @param {string} rawUrl
 * @param {string} [source="page"]
 * @param {object} [extraInfo={}]
 */
function recordMedia(tabId, rawUrl, source = 'page', extraInfo = {}) {
  if (typeof tabId !== 'number' || tabId < 0 || !rawUrl) {
    return;
  }

  // Strict compliance with Chrome Web Store policies: ignore YouTube/GoogleVideo media
  const lowerRaw = rawUrl.toLowerCase();
  if (
    lowerRaw.includes('googlevideo.com') ||
    lowerRaw.includes('youtube.com') ||
    lowerRaw.includes('youtu.be')
  ) {
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
  const cleanUrl =
    typeof DownloaderUtils !== 'undefined' && DownloaderUtils.cleanStreamUrl
      ? DownloaderUtils.cleanStreamUrl(rawUrl)
      : rawUrl
          .replace(/[?&]range=[^&]+/g, '')
          .replace(/[?&]rn=[^&]+/g, '')
          .replace(/[?&]rbuf=[^&]+/g, '');

  const resolvedType = extraInfo.type || (classification ? classification.type : 'mp4');
  const resolvedLabel =
    extraInfo.label || (classification ? classification.label : 'Detected Video');
  const resolvedExt = extraInfo.ext || (classification ? classification.ext : 'mp4');
  const resolvedQuality = extraInfo.quality || (classification ? classification.quality : '');
  const isMuxed = Boolean(classification && classification.isMuxed);
  const isAudioStream = resolvedQuality === 'Audio' || resolvedExt === 'm4a';

  const urlKey = cleanUrl.split('?')[0];

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
    ext: 'mp4',
    quality: resolvedQuality,
    isMuxed: isMuxed,
    source: source,
    title: extraInfo.title || 'Detected Video',
    timestamp: Date.now()
  };

  mediaMap.set(urlKey, mediaItem);
  updateToolbarBadge(tabId);
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
    const tabTelemetry =
      typeof targetTabId === 'number' && tabTelemetryStore.has(targetTabId)
        ? tabTelemetryStore.get(targetTabId)
        : latestPlayerTelemetry;

    sendResponse({
      ok: true,
      config: activeConfig,
      playerTelemetry: tabTelemetry,
      mediaCount: mediaCount
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
