/**
 * My Quality 4k v2.1 - Popup Controller Script
 *
 * Manages user preferences, live zero-reload configuration application,
 * Green/Red switch-style apply status indicator, collapsible features dropdown,
 * real-time Deep Pre-Buffer & network metrics display, and JSON report exports.
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

  const QUALITY_LABELS = {
    highres: '4320p (8K)',
    hd2880: '2880p (5K)',
    hd2160: '2160p (4K)',
    hd1440: '1440p (2K)',
    hd1080: '1080p (FHD)',
    hd720: '720p (HD)',
    large: '480p',
    medium: '360p',
    small: '240p',
    tiny: '144p',
    auto: 'Auto'
  };

  let appliedConfig = Object.assign({}, DEFAULT_CONFIG);
  let currentConfig = Object.assign({}, DEFAULT_CONFIG);
  let lastDashboardData = null;

  // DOM Elements
  const elToggleEnabled = document.getElementById('toggle-enabled');
  const elSelectQuality = document.getElementById('select-quality');
  const elSelectBufferTarget = document.getElementById('select-buffer-target');
  const elBtnForceNow = document.getElementById('btn-force-now');
  const elApplyStatusSwitch = document.getElementById('apply-status-switch');
  const elApplyStatusText = document.getElementById('apply-status-text');

  const elFeaturesDropdown = document.getElementById('features-dropdown');
  const elBtnFeaturesDropdown = document.getElementById('btn-features-dropdown');
  const elDropdownActiveCount = document.getElementById('dropdown-active-count');

  const elToggleDeepPrebuffer = document.getElementById('toggle-deep-prebuffer');
  const elToggleParallelPrefetch = document.getElementById('toggle-parallel-prefetch');
  const elToggleHeadstartBoost = document.getElementById('toggle-headstart-boost');
  const elToggleBlockAv1 = document.getElementById('toggle-block-av1');
  const elToggleBlockHdr = document.getElementById('toggle-block-hdr');
  const elToggleBlock60fps = document.getElementById('toggle-block-60fps');
  const elToggleStabilizeBuffer = document.getElementById('toggle-stabilize-buffer');
  const elToggleDisableAmbient = document.getElementById('toggle-disable-ambient');
  const elToggleDropGuard = document.getElementById('toggle-drop-guard');
  const elToggleTelemetrySync = document.getElementById('toggle-telemetry-sync');

  const elMetricResolution = document.getElementById('metric-resolution');
  const elMetricCodec = document.getElementById('metric-codec');
  const elMetricBuffer = document.getElementById('metric-buffer');
  const elBufferBarFill = document.getElementById('buffer-bar-fill');
  const elMetricThroughput = document.getElementById('metric-throughput');
  const elMetricLatency = document.getElementById('metric-latency');
  const elMetricDrops = document.getElementById('metric-drops');
  const elMetricGaps = document.getElementById('metric-gaps');

  const elNetCdnHost = document.getElementById('net-cdn-host');
  const elNetTotalChunks = document.getElementById('net-total-chunks');
  const elNetTotalMb = document.getElementById('net-total-mb');
  const elNetFailedChunks = document.getElementById('net-failed-chunks');
  const elNetworkLogsBody = document.getElementById('network-logs-body');

  const elBtnExportLogs = document.getElementById('btn-export-logs');
  const elBtnClearLogs = document.getElementById('btn-clear-logs');
  const elStatusIndicator = document.getElementById('status-indicator');

  const featureToggleElements = [
    elToggleDeepPrebuffer,
    elToggleParallelPrefetch,
    elToggleHeadstartBoost,
    elToggleBlockAv1,
    elToggleBlockHdr,
    elToggleBlock60fps,
    elToggleStabilizeBuffer,
    elToggleDisableAmbient,
    elToggleDropGuard,
    elToggleTelemetrySync
  ];

  /**
   * Initializes tab switching behavior
   */
  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-tab');
        buttons.forEach(function (b) {
          b.classList.remove('active');
        });
        panels.forEach(function (p) {
          p.classList.remove('active');
        });
        btn.classList.add('active');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  /**
   * Initializes collapsible dropdown menu for the 10 buffer & codec features
   */
  function setupFeaturesDropdown() {
    if (!elBtnFeaturesDropdown || !elFeaturesDropdown) {
      return;
    }

    elBtnFeaturesDropdown.addEventListener('click', function () {
      const isOpen = elFeaturesDropdown.classList.toggle('open');
      elBtnFeaturesDropdown.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  /**
   * Updates the X/10 active features badge on the dropdown header
   */
  function updateDropdownActiveCountBadge() {
    if (!elDropdownActiveCount) {
      return;
    }
    let activeCount = 0;
    featureToggleElements.forEach(function (el) {
      if (el && el.checked) {
        activeCount += 1;
      }
    });
    elDropdownActiveCount.textContent = `${activeCount}/${featureToggleElements.length} ativos`;
  }

  /**
   * Reads current UI control values into a configuration object without saving yet
   * @returns {object}
   */
  function readConfigFromUI() {
    return {
      enabled: elToggleEnabled ? elToggleEnabled.checked : true,
      targetQuality: elSelectQuality ? elSelectQuality.value : 'hd2160',
      targetBufferSec: elSelectBufferTarget ? Number(elSelectBufferTarget.value) || 120 : 120,
      deepPreBuffer: elToggleDeepPrebuffer ? elToggleDeepPrebuffer.checked : true,
      parallelPrefetch: elToggleParallelPrefetch ? elToggleParallelPrefetch.checked : true,
      headstartBoost: elToggleHeadstartBoost ? elToggleHeadstartBoost.checked : false,
      blockAV1: elToggleBlockAv1 ? elToggleBlockAv1.checked : true,
      blockHDR60: elToggleBlockHdr ? elToggleBlockHdr.checked : true,
      block60fps: elToggleBlock60fps ? elToggleBlock60fps.checked : false,
      stabilizeBuffer: elToggleStabilizeBuffer ? elToggleStabilizeBuffer.checked : true,
      disableAmbientMode: elToggleDisableAmbient ? elToggleDisableAmbient.checked : true,
      smartDropGuard: elToggleDropGuard ? elToggleDropGuard.checked : true,
      telemetrySync: elToggleTelemetrySync ? elToggleTelemetrySync.checked : false,
      telemetryEndpoint: DEFAULT_CONFIG.telemetryEndpoint
    };
  }

  /**
   * Compares two config objects to determine if there are unapplied changes
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  function isConfigEqual(a, b) {
    if (!a || !b) {
      return false;
    }
    const keys = [
      'enabled',
      'targetQuality',
      'targetBufferSec',
      'deepPreBuffer',
      'parallelPrefetch',
      'headstartBoost',
      'blockAV1',
      'blockHDR60',
      'block60fps',
      'stabilizeBuffer',
      'disableAmbientMode',
      'smartDropGuard',
      'telemetrySync'
    ];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (a[k] !== b[k]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Updates the Green/Red switch-style indicator next to "Aplicar Agora"
   * - Green ("Aplicado"): UI matches appliedConfig
   * - Red ("Nao Aplicado"): User modified settings and needs to click "Aplicar Agora"
   */
  function updateApplyStatusIndicator() {
    const uiCfg = readConfigFromUI();
    currentConfig = uiCfg;
    updateDropdownActiveCountBadge();

    const isApplied = isConfigEqual(uiCfg, appliedConfig);

    if (elApplyStatusSwitch) {
      if (isApplied) {
        elApplyStatusSwitch.classList.remove('is-pending');
        elApplyStatusSwitch.classList.add('is-applied');
        elApplyStatusSwitch.title = 'Verde: Alteracoes aplicadas';
      } else {
        elApplyStatusSwitch.classList.remove('is-applied');
        elApplyStatusSwitch.classList.add('is-pending');
        elApplyStatusSwitch.title = 'Vermelho: Alteracoes nao aplicadas (clique em Aplicar Agora)';
      }
    }

    if (elStatusIndicator) {
      if (!isApplied) {
        elStatusIndicator.textContent = 'Status: Alteracoes Pendentes (Clique em Aplicar Agora)';
      } else {
        elStatusIndicator.textContent = appliedConfig.enabled
          ? 'Status: Deep Pre-Buffer 4K Ativo'
          : 'Status: Otimizacao Pausada';
      }
    }
  }

  /**
   * Applies config object to UI inputs
   */
  function renderConfigControls(cfg) {
    elToggleEnabled.checked = Boolean(cfg.enabled);
    elSelectQuality.value = cfg.targetQuality || 'hd2160';
    if (elSelectBufferTarget) {
      elSelectBufferTarget.value = String(cfg.targetBufferSec || 120);
    }
    if (elToggleDeepPrebuffer) {
      elToggleDeepPrebuffer.checked = cfg.deepPreBuffer !== false;
    }
    if (elToggleParallelPrefetch) {
      elToggleParallelPrefetch.checked = cfg.parallelPrefetch !== false;
    }
    if (elToggleHeadstartBoost) {
      elToggleHeadstartBoost.checked = Boolean(cfg.headstartBoost);
    }
    elToggleBlockAv1.checked = Boolean(cfg.blockAV1);
    elToggleBlockHdr.checked = Boolean(cfg.blockHDR60);
    if (elToggleBlock60fps) {
      elToggleBlock60fps.checked = Boolean(cfg.block60fps);
    }
    elToggleStabilizeBuffer.checked = Boolean(cfg.stabilizeBuffer);
    elToggleDisableAmbient.checked = Boolean(cfg.disableAmbientMode);
    elToggleDropGuard.checked = Boolean(cfg.smartDropGuard);
    elToggleTelemetrySync.checked = Boolean(cfg.telemetrySync);

    updateApplyStatusIndicator();
  }

  /**
   * Formats MIME codec string into concise readable form
   */
  function formatCodecLabel(mimeString) {
    if (!mimeString || mimeString === 'unknown') {
      return 'VP9 SDR (Padrao)';
    }
    const lower = mimeString.toLowerCase();
    if (lower.includes('vp09.00') || lower.includes('vp9')) {
      return 'VP9 Profile 0 (Hardware)';
    }
    if (lower.includes('avc1')) {
      return 'H.264 / AVC1 (Hardware)';
    }
    if (lower.includes('av01')) {
      return 'AV1 (Software/GPU)';
    }
    return mimeString;
  }

  /**
   * Updates dashboard cards and network logs table
   */
  function renderDashboardState(data) {
    if (!data) {
      return;
    }
    lastDashboardData = data;

    const player = data.playerTelemetry;
    const netSummary = data.networkSummary || {};
    const logs = data.networkLogs || [];

    if (player) {
      const qLabel = QUALITY_LABELS[player.currentQuality] || player.currentQuality || 'Auto';
      elMetricResolution.textContent =
        player.resolution && player.resolution !== 'N/A'
          ? `${qLabel} (${player.resolution})`
          : qLabel;

      elMetricCodec.textContent = `Codec: ${formatCodecLabel(player.videoMimeType)}`;

      const bufSec = Number(player.bufferAheadSec || 0);
      const targetSec = Number(player.targetBufferSec || appliedConfig.targetBufferSec || 120);
      elMetricBuffer.textContent = `${bufSec.toFixed(1)}s / ${targetSec}s`;

      // Scale buffer progress bar against user's configured targetBufferSec
      const pct = Math.min(100, Math.max(4, Math.round((bufSec / targetSec) * 100)));
      elBufferBarFill.style.width = `${pct}%`;
      elBufferBarFill.classList.toggle('buffer-low', bufSec < 12);

      elMetricDrops.textContent = `${Number(player.dropRatePercent || 0).toFixed(1)}% perdas`;
      const gaps = player.microGapsRecovered || 0;
      const evicted = player.evictedBackBufferCount || 0;
      elMetricGaps.textContent = `Gaps: ${gaps} | Reciclados: ${evicted}`;
    }

    elMetricThroughput.textContent = `${Number(netSummary.avgThroughputMbps || 0).toFixed(1)} Mbps`;
    elMetricLatency.textContent = `Latencia: ${netSummary.avgLatencyMs || 0} ms`;

    elNetCdnHost.textContent = netSummary.lastCdnHost || 'N/A';
    elNetTotalChunks.textContent = String(netSummary.totalChunks || 0);
    elNetTotalMb.textContent = `${Number(netSummary.totalMB || 0).toFixed(1)} MB`;
    elNetFailedChunks.textContent = String(netSummary.failedChunks || 0);

    renderNetworkTable(logs);
  }

  /**
   * Populates the network logs table
   */
  function renderNetworkTable(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      elNetworkLogsBody.innerHTML =
        '<tr><td colspan="4" class="empty-log-row">Nenhum pacote googlevideo.com capturado ainda. Abra um video no YouTube.</td></tr>';
      return;
    }

    const rowsHtml = logs
      .slice(0, 20)
      .map(function (entry) {
        const formatLabel = entry.itag ? `itag=${entry.itag}` : 'chunk';
        const sizeStr = `${entry.chunkKB || 0} KB`;
        const timeStr = `${entry.durationMs || 0} ms`;
        const speedStr = entry.status === 'OK' ? `${entry.throughputMbps || 0} Mbps` : 'ERRO';
        return `<tr>
        <td title="${entry.itagDescription || ''}">${formatLabel}</td>
        <td>${sizeStr}</td>
        <td>${timeStr}</td>
        <td>${speedStr}</td>
      </tr>`;
      })
      .join('');

    elNetworkLogsBody.innerHTML = rowsHtml;
  }

  /**
   * Requests fresh state from the Background Service Worker and active YouTube tab
   */
  function refreshTelemetry() {
    if (!chrome || !chrome.runtime) {
      return;
    }

    chrome.runtime.sendMessage({ type: 'MQ4K_GET_DASHBOARD_STATE' }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        return;
      }
      renderDashboardState(response);
    });
  }

  /**
   * Applies all pending UI settings immediately to chrome.storage.local AND hot-applies
   * them to the active YouTube tab without requiring a page reload (F5).
   * Turns the switch-style indicator next to "Aplicar Agora" from Red to Green.
   */
  function applyConfigurationNow() {
    const newConfig = readConfigFromUI();
    appliedConfig = Object.assign({}, newConfig);
    currentConfig = Object.assign({}, newConfig);

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ mq4k_config: appliedConfig });
    }

    updateApplyStatusIndicator();

    if (!chrome || !chrome.tabs) {
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url || '';

      chrome.tabs.sendMessage(
        tabId,
        { type: 'MQ4K_FORCE_QUALITY', config: appliedConfig },
        function (res) {
          const sendFailed = Boolean(chrome.runtime.lastError) || !res;
          if (
            sendFailed &&
            tabUrl.includes('youtube.com') &&
            chrome.scripting &&
            typeof chrome.scripting.executeScript === 'function'
          ) {
            // If YouTube tab was already open before extension load/reload, inject hooks on the fly without page reload
            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                files: ['src/content/page-hook.js'],
                world: 'MAIN'
              },
              function () {
                void chrome.runtime.lastError;
                chrome.scripting.executeScript(
                  {
                    target: { tabId: tabId },
                    files: ['src/content/content-controller.js'],
                    world: 'ISOLATED'
                  },
                  function () {
                    void chrome.runtime.lastError;
                    chrome.tabs.sendMessage(
                      tabId,
                      { type: 'MQ4K_FORCE_QUALITY', config: appliedConfig },
                      function () {
                        void chrome.runtime.lastError;
                        setTimeout(refreshTelemetry, 250);
                      }
                    );
                  }
                );
              }
            );
          } else {
            setTimeout(refreshTelemetry, 250);
          }
        }
      );
    });
  }

  /**
   * Exports current telemetry and network log history as a JSON file
   */
  function exportDiagnosticReport() {
    const report = {
      project: 'My Quality 4k',
      version: '2.1.0',
      license: 'GPL-3.0',
      aiAssistedEngineering: 'Argon (Google Antigravity) & Claude Streaming Architect',
      exportedAt: new Date().toISOString(),
      configuration: appliedConfig,
      dashboardSnapshot: lastDashboardData
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-quality-4k-telemetry-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Clears captured network logs in the Background Service Worker
   */
  function clearNetworkLogs() {
    if (!chrome || !chrome.runtime) {
      return;
    }
    chrome.runtime.sendMessage({ type: 'MQ4K_CLEAR_NETWORK_LOGS' }, function () {
      refreshTelemetry();
    });
  }

  // Bind Event Listeners: changing any control marks status as Red ("Nao Aplicado") until "Aplicar Agora" is clicked
  [
    elToggleEnabled,
    elSelectQuality,
    elSelectBufferTarget,
    elToggleDeepPrebuffer,
    elToggleParallelPrefetch,
    elToggleHeadstartBoost,
    elToggleBlockAv1,
    elToggleBlockHdr,
    elToggleBlock60fps,
    elToggleStabilizeBuffer,
    elToggleDisableAmbient,
    elToggleDropGuard,
    elToggleTelemetrySync
  ].forEach(function (inputEl) {
    if (inputEl) {
      inputEl.addEventListener('change', updateApplyStatusIndicator);
    }
  });

  if (elBtnForceNow) {
    elBtnForceNow.addEventListener('click', applyConfigurationNow);
  }
  if (elApplyStatusSwitch) {
    elApplyStatusSwitch.addEventListener('click', applyConfigurationNow);
  }
  if (elBtnExportLogs) {
    elBtnExportLogs.addEventListener('click', exportDiagnosticReport);
  }
  if (elBtnClearLogs) {
    elBtnClearLogs.addEventListener('click', clearNetworkLogs);
  }

  // Initialization
  setupTabs();
  setupFeaturesDropdown();

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['mq4k_config'], function (result) {
      if (result && result.mq4k_config) {
        appliedConfig = Object.assign({}, DEFAULT_CONFIG, result.mq4k_config);
        currentConfig = Object.assign({}, appliedConfig);
      }
      renderConfigControls(appliedConfig);
      refreshTelemetry();
    });
  } else {
    renderConfigControls(appliedConfig);
  }

  setInterval(refreshTelemetry, 1000);
})();
