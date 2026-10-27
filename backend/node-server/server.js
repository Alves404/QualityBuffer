/**
 * My Quality 4k - Node.js Telemetry & Route Caching Server
 *
 * Receives real-time googlevideo.com chunk telemetry from the browser extension,
 * persists logs for offline analysis, and computes adaptive buffer heuristics
 * and CDN route performance scores.
 *
 * Assisted engineering by Argon (Google Antigravity).
 * License: GPL-3.0
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3456;
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'network_logs.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const telemetryState = {
  startedAt: new Date().toISOString(),
  totalPayloadsReceived: 0,
  cdnRoutes: {},
  itagCounts: {},
  recentRecords: []
};

// Load existing logs if available
if (fs.existsSync(LOG_FILE)) {
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.recentRecords)) {
      telemetryState.recentRecords = parsed.recentRecords.slice(0, 200);
    }
    if (parsed.cdnRoutes) {
      telemetryState.cdnRoutes = parsed.cdnRoutes;
    }
    if (parsed.itagCounts) {
      telemetryState.itagCounts = parsed.itagCounts;
    }
  } catch (err) {
    // Start fresh if file is corrupted
  }
}

/**
 * Persists telemetry state to disk
 */
function persistTelemetry() {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(telemetryState, null, 2), 'utf8');
  } catch (err) {
    console.error('[My-Quality-4k] Error writing telemetry log file:', err.message);
  }
}

/**
 * Updates CDN route statistics and calculates recommended buffer heuristics
 * @param {object} payload
 */
function processTelemetryPayload(payload) {
  telemetryState.totalPayloadsReceived += 1;

  const chunk = payload.networkChunk || {};
  const cdnHost = chunk.cdnHost || 'unknown';
  const itag = String(chunk.itag || 'unknown');

  if (!telemetryState.cdnRoutes[cdnHost]) {
    telemetryState.cdnRoutes[cdnHost] = {
      host: cdnHost,
      chunks: 0,
      errors: 0,
      totalBytes: 0,
      avgThroughputMbps: 0,
      avgDurationMs: 0,
      lastSeen: null
    };
  }

  const route = telemetryState.cdnRoutes[cdnHost];
  route.chunks += 1;
  route.lastSeen = new Date().toISOString();

  if (chunk.status === 'OK') {
    route.totalBytes += chunk.chunkBytes || 0;
    const prevCount = Math.max(1, route.chunks - route.errors - 1);
    route.avgThroughputMbps = Number(
      (((route.avgThroughputMbps * prevCount) + (chunk.throughputMbps || 0)) / (prevCount + 1)).toFixed(2)
    );
    route.avgDurationMs = Math.round(
      ((route.avgDurationMs * prevCount) + (chunk.durationMs || 0)) / (prevCount + 1)
    );
  } else {
    route.errors += 1;
  }

  telemetryState.itagCounts[itag] = (telemetryState.itagCounts[itag] || 0) + 1;

  telemetryState.recentRecords.unshift({
    receivedAt: new Date().toISOString(),
    networkChunk: chunk,
    playerMetrics: payload.playerMetrics || null
  });

  if (telemetryState.recentRecords.length > 200) {
    telemetryState.recentRecords.pop();
  }

  if (telemetryState.totalPayloadsReceived % 5 === 0) {
    persistTelemetry();
  }
}

/**
 * Computes optimal buffer heuristics based on collected network & player logs
 */
function computeAdaptiveHeuristics() {
  const routes = Object.values(telemetryState.cdnRoutes);
  let globalThroughput = 0;
  let globalLatency = 0;

  if (routes.length > 0) {
    globalThroughput = Number(
      (routes.reduce((acc, r) => acc + r.avgThroughputMbps, 0) / routes.length).toFixed(2)
    );
    globalLatency = Math.round(
      routes.reduce((acc, r) => acc + r.avgDurationMs, 0) / routes.length
    );
  }

  // Recommend 4K (hd2160) when throughput exceeds 25 Mbps, 2K (hd1440) when >= 12 Mbps
  let recommendedQuality = 'hd2160';
  if (globalThroughput > 0 && globalThroughput < 12) {
    recommendedQuality = 'hd1080';
  } else if (globalThroughput >= 12 && globalThroughput < 22) {
    recommendedQuality = 'hd1440';
  }

  return {
    evaluatedAt: new Date().toISOString(),
    observedThroughputMbps: globalThroughput,
    observedChunkLatencyMs: globalLatency,
    recommendedTargetQuality: recommendedQuality,
    recommendedCodecPolicy: 'VP9_SDR_HARDWARE_ONLY',
    microGapRecoveryThresholdMs: globalLatency > 250 ? 25 : 15
  };
}

/**
 * HTTP Request Handler
 */
const server = http.createServer(function (req, res) {
  // Enable CORS for Chrome Extension communication
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'UP',
      service: 'My-Quality-4k-Telemetry-Server',
      uptimeSec: Math.round(process.uptime())
    }));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      startedAt: telemetryState.startedAt,
      totalPayloadsReceived: telemetryState.totalPayloadsReceived,
      cdnRoutes: telemetryState.cdnRoutes,
      itagCounts: telemetryState.itagCounts,
      heuristics: computeAdaptiveHeuristics()
    }, null, 2));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/heuristics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      heuristics: computeAdaptiveHeuristics()
    }, null, 2));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/telemetry') {
    let body = '';
    req.on('data', function (chunk) {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', function () {
      try {
        const parsed = JSON.parse(body);
        processTelemetryPayload(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          heuristics: computeAdaptiveHeuristics()
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
});

if (require.main === module) {
  server.listen(PORT, function () {
    console.log(`[My-Quality-4k] Telemetry & Caching Server listening on http://localhost:${PORT}`);
    console.log(`[My-Quality-4k] Log persistence path: ${LOG_FILE}`);
  });
}

module.exports = { server, computeAdaptiveHeuristics, processTelemetryPayload };
