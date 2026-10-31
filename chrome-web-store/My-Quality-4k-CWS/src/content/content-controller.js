/**
 * My Quality 4k v2.0 - Content Controller (ISOLATED World)
 *
 * Bridges Chrome Extension APIs (chrome.storage, chrome.runtime) with the MAIN
 * world Page Hook Engine (page-hook.js) via CustomEvents.
 * Includes full guard against "Extension context invalidated" errors when
 * the extension is reloaded in chrome://extensions while a YouTube tab is open.
 *
 * Assisted engineering by Argon (Google Antigravity) & Claude Streaming Architect.
 * License: GPL-3.0
 */

(function () {
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
    smartDropGuard: true,
    telemetrySync: false,
    telemetryEndpoint: 'http://localhost:3456/api/telemetry'
  };

  let latestPlayerMetrics = null;

  /**
   * Safely checks whether the current extension execution context is still valid.
   * Prevents "Uncaught Error: Extension context invalidated" when reloading unpacked extensions.
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
   * Handles real-time telemetry snapshots from the MAIN world Page Hook Engine.
   * Automatically detaches itself if the extension is reloaded in chrome://extensions.
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
            // Suppress disconnect errors if service worker is inactive
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
        // Extension context was invalidated mid-flight; detach listener cleanly
        window.removeEventListener('MQ4K_PLAYER_METRICS', handlePlayerMetrics);
      }
    }
  }

  window.addEventListener('MQ4K_PLAYER_METRICS', handlePlayerMetrics);

  // Listen for direct commands from Popup UI
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

        return false;
      });
    } catch (e) {
      // Ignore
    }
  }

  initializeConfig();
})();
