/**
 * My Quality 4k - Content Controller (ISOLATED World)
 *
 * Bridges Chrome Extension APIs (chrome.storage, chrome.runtime) with the MAIN
 * world Page Hook Engine (page-hook.js) via CustomEvents.
 *
 * Assisted engineering by Argon (Google Antigravity).
 * License: GPL-3.0
 */

(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    enabled: true,
    targetQuality: 'hd2160',
    blockAV1: true,
    blockHDR60: true,
    block60fps: false,
    stabilizeBuffer: true,
    disableAmbientMode: true,
    smartDropGuard: true,
    telemetrySync: false,
    telemetryEndpoint: 'http://localhost:3456/api/telemetry'
  };

  let latestPlayerMetrics = null;

  /**
   * Dispatches configuration state to the MAIN world Page Hook Engine
   * @param {object} config
   */
  function syncConfigToMainWorld(config) {
    const merged = Object.assign({}, DEFAULT_CONFIG, config || {});
    window.dispatchEvent(new CustomEvent('MQ4K_CONFIG_SYNC', { detail: merged }));
  }

  /**
   * Loads saved configuration from chrome.storage.local on startup
   */
  function initializeConfig() {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      syncConfigToMainWorld(DEFAULT_CONFIG);
      return;
    }

    chrome.storage.local.get(['mq4k_config'], function (result) {
      if (chrome.runtime.lastError) {
        syncConfigToMainWorld(DEFAULT_CONFIG);
        return;
      }
      const savedConfig = result && result.mq4k_config ? result.mq4k_config : DEFAULT_CONFIG;
      syncConfigToMainWorld(savedConfig);
    });
  }

  // Listen for storage updates triggered from Popup UI
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName === 'local' && changes.mq4k_config && changes.mq4k_config.newValue) {
        syncConfigToMainWorld(changes.mq4k_config.newValue);
      }
    });
  }

  // Receive real-time telemetry snapshots from the MAIN world Page Hook Engine
  window.addEventListener('MQ4K_PLAYER_METRICS', function (event) {
    if (event && event.detail) {
      latestPlayerMetrics = event.detail;
      if (chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage(
          {
            type: 'MQ4K_PLAYER_TELEMETRY',
            payload: latestPlayerMetrics
          },
          function () {
            // Suppress disconnect errors if service worker is inactive
            void chrome.runtime.lastError;
          }
        );
      }
    }
  });

  // Listen for direct commands from Popup UI
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || typeof message !== 'object') {
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
        window.dispatchEvent(new CustomEvent('MQ4K_FORCE_QUALITY_NOW'));
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });
  }

  initializeConfig();
})();
