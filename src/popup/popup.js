/**
 * My Quality 4k v2.0 - Popup Controller Script
 *
 * Manages user preferences, real-time Deep Pre-Buffer & network metrics display,
 * and diagnostic report exports.
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
    headstartBoost: true,
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

  let currentConfig = Object.assign({}, DEFAULT_CONFIG);
  let lastDashboardData = null;

  // DOM Elements
  const elToggleEnabled = document.getElementById('toggle-enabled');
  const elSelectQuality = document.getElementById('select-quality');
  const elSelectBufferTarget = document.getElementById('select-buffer-target');
  const elBtnForceNow = document.getElementById('btn-force-now');
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
      elToggleHeadstartBoost.checked = cfg.headstartBoost !== false;
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

    elStatusIndicator.textContent = cfg.enabled
      ? 'Status: Deep Pre-Buffer 4K Ativo'
      : 'Status: Otimizacao Pausada';
  }

  /**
   * Reads UI inputs and saves updated config to chrome.storage.local
   */
  function saveConfigFromUI() {
    currentConfig = {
      enabled: elToggleEnabled.checked,
      targetQuality: elSelectQuality.value,
      targetBufferSec: elSelectBufferTarget ? Number(elSelectBufferTarget.value) || 120 : 120,
      deepPreBuffer: elToggleDeepPrebuffer ? elToggleDeepPrebuffer.checked : true,
      parallelPrefetch: elToggleParallelPrefetch ? elToggleParallelPrefetch.checked : true,
      headstartBoost: elToggleHeadstartBoost ? elToggleHeadstartBoost.checked : true,
      blockAV1: elToggleBlockAv1.checked,
      blockHDR60: elToggleBlockHdr.checked,
      block60fps: elToggleBlock60fps ? elToggleBlock60fps.checked : false,
      stabilizeBuffer: elToggleStabilizeBuffer.checked,
      disableAmbientMode: elToggleDisableAmbient.checked,
      smartDropGuard: elToggleDropGuard.checked,
      telemetrySync: elToggleTelemetrySync.checked,
      telemetryEndpoint: DEFAULT_CONFIG.telemetryEndpoint
    };

    elStatusIndicator.textContent = currentConfig.enabled
      ? 'Status: Deep Pre-Buffer 4K Ativo'
      : 'Status: Otimizacao Pausada';

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ mq4k_config: currentConfig });
    }
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
      const targetSec = Number(player.targetBufferSec || currentConfig.targetBufferSec || 120);
      elMetricBuffer.textContent = `${bufSec.toFixed(1)}s / ${targetSec}s`;

      // Scale buffer progress bar against user's configured targetBufferSec
      const pct = Math.min(100, Math.max(4, Math.round((bufSec / targetSec) * 100)));
      elBufferBarFill.style.width = `${pct}%`;
      elBufferBarFill.style.backgroundColor = bufSec >= 12 ? '#1db954' : '#f59e0b';

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
   * Sends immediate quality lock trigger to active YouTube tab
   */
  function triggerForceQualityNow() {
    saveConfigFromUI();
    if (!chrome || !chrome.tabs) {
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'MQ4K_FORCE_QUALITY' }, function () {
          void chrome.runtime.lastError;
          setTimeout(refreshTelemetry, 250);
        });
      }
    });
  }

  /**
   * Exports current telemetry and network log history as a JSON file
   */
  function exportDiagnosticReport() {
    const report = {
      project: 'My Quality 4k',
      version: '2.0.0',
      license: 'GPL-3.0',
      aiAssistedEngineering: 'Argon (Google Antigravity) & Claude Streaming Architect',
      exportedAt: new Date().toISOString(),
      configuration: currentConfig,
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

  // Bind Event Listeners
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
      inputEl.addEventListener('change', saveConfigFromUI);
    }
  });

  if (elBtnForceNow) {
    elBtnForceNow.addEventListener('click', triggerForceQualityNow);
  }
  if (elBtnExportLogs) {
    elBtnExportLogs.addEventListener('click', exportDiagnosticReport);
  }
  if (elBtnClearLogs) {
    elBtnClearLogs.addEventListener('click', clearNetworkLogs);
  }

  // Initialization
  setupTabs();

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['mq4k_config'], function (result) {
      if (result && result.mq4k_config) {
        currentConfig = Object.assign({}, DEFAULT_CONFIG, result.mq4k_config);
      }
      renderConfigControls(currentConfig);
      refreshTelemetry();
    });
  } else {
    renderConfigControls(currentConfig);
  }

  setInterval(refreshTelemetry, 1000);
})();
