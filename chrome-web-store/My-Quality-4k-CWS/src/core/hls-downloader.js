/**
 * My Quality 4k - V12 HLS (M3U8 / AES-128 / TS) Turbo Downloader Engine
 *
 * Implements the V12 Async Warm-up & Max Agility architecture:
 * - Automatic highest-bandwidth (#EXT-X-STREAM-INF) stream selection
 * - Non-blocking background AES-128 key fetch + WebCrypto CPU import warm-up
 * - 12-connection concurrent worker pool with automatic retry backoff
 * - Periodic main-thread yielding (yieldThread) to prevent frame drops on active videos
 *
 * Assisted engineering by Gemini 4 Argon (Google Antigravity).
 * License: GPL-3.0
 */

'use strict';

class HLSDownloader {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 12;
    this.maxRetries = options.maxRetries || 3;
    this.keyCache = new Map();
    this.cryptoKeyCache = new Map();
    this.abortController = null;
    this.isDownloading = false;
  }

  /**
   * Cancels the active download operation.
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.isDownloading = false;
    }
  }

  /**
   * Decrypts an AES-128-CBC encrypted TS segment using WebCrypto hardware acceleration.
   * @param {ArrayBuffer} buffer
   * @param {CryptoKey} cryptoKey
   * @param {number} sequenceNum
   * @param {string | null} explicitIVHex
   * @returns {Promise<Uint8Array>}
   */
  async decryptSegment(buffer, cryptoKey, sequenceNum, explicitIVHex) {
    let iv;
    if (explicitIVHex) {
      iv = DownloaderUtils.hexToUint8Array(explicitIVHex);
    } else {
      iv = new Uint8Array(16);
      new DataView(iv.buffer).setUint32(12, sequenceNum);
    }
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv },
      cryptoKey,
      buffer
    );
    return new Uint8Array(decrypted);
  }

  /**
   * Fetches and imports an AES-128 key into WebCrypto with full Promise + CPU caching (V12 pattern).
   * @param {string} keyUrl
   * @returns {Promise<CryptoKey>}
   */
  async getImportedCryptoKey(keyUrl) {
    if (this.cryptoKeyCache.has(keyUrl)) {
      return this.cryptoKeyCache.get(keyUrl);
    }

    if (!this.keyCache.has(keyUrl)) {
      const keyPromise = (async () => {
        const res = await fetch(keyUrl, { credentials: 'omit' });
        if (!res.ok) {
          throw new Error(`AES key fetch failed (HTTP ${res.status})`);
        }
        const keyBuffer = await res.arrayBuffer();
        return await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-CBC' },
          false,
          ['decrypt']
        );
      })();
      this.keyCache.set(keyUrl, keyPromise);
    }

    const cryptoKey = await this.keyCache.get(keyUrl);
    this.cryptoKeyCache.set(keyUrl, cryptoKey);
    return cryptoKey;
  }

  /**
   * V12 Async Key Warm-up: fires background fetch + WebCrypto importKey for all unique keys
   * without blocking segment workers.
   * @param {string[]} keyUrls
   */
  preloadKeys(keyUrls) {
    keyUrls.forEach((url) => {
      if (url) {
        this.getImportedCryptoKey(url).catch(() => {
          // Handled on demand by segment worker if retry is needed
        });
      }
    });
  }

  /**
   * Parses an M3U8 playlist, automatically resolving Master Playlists (#EXT-X-STREAM-INF)
   * to the highest-bandwidth (highest resolution) variant.
   * @param {string} m3u8Url
   * @param {AbortSignal} [signal]
   */
  async parseM3U8(m3u8Url, signal) {
    let currentUrl = m3u8Url;
    const res = await fetch(currentUrl, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch M3U8 (HTTP ${res.status})`);
    }
    let text = await res.text();

    await DownloaderUtils.yieldThread();

    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n');
      let bestBandwidth = -1;
      let bestPath = '';

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line.includes('#EXT-X-STREAM-INF')) {
          const match = line.match(/BANDWIDTH=(\d+)/);
          const bandwidth = match ? parseInt(match[1], 10) : 0;
          let j = i + 1;
          while (j < lines.length && (lines[j].trim().startsWith('#') || lines[j].trim() === '')) {
            j += 1;
          }
          if (j < lines.length && bandwidth > bestBandwidth) {
            bestBandwidth = bandwidth;
            bestPath = lines[j].trim();
          }
        }
      }

      if (bestPath) {
        currentUrl = DownloaderUtils.resolveSecureUrl(bestPath, currentUrl);
        const subRes = await fetch(currentUrl, { signal });
        if (!subRes.ok) {
          throw new Error(`Failed to fetch media playlist (HTTP ${subRes.status})`);
        }
        text = await subRes.text();
      }
    }

    await DownloaderUtils.yieldThread();

    const lines = text.split('\n');
    const segments = [];
    let initSegmentUrl = null;
    let currentKeyUrl = null;
    let currentIVHex = null;
    let mediaSequence = 0;
    const uniqueKeyUrls = new Set();

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();

      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        mediaSequence = parseInt(line.split(':')[1], 10) || 0;
      } else if (line.startsWith('#EXT-X-KEY:') && line.includes('METHOD=AES-128')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        const ivMatch = line.match(/IV=([^,\n]+)/);
        if (uriMatch) {
          currentKeyUrl = DownloaderUtils.resolveSecureUrl(uriMatch[1], currentUrl);
          uniqueKeyUrls.add(currentKeyUrl);
        }
        currentIVHex = ivMatch ? ivMatch[1] : null;
      } else if (line.startsWith('#EXT-X-KEY:') && line.includes('METHOD=NONE')) {
        currentKeyUrl = null;
        currentIVHex = null;
      } else if (line.startsWith('#EXT-X-MAP:')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch) {
          initSegmentUrl = DownloaderUtils.resolveSecureUrl(uriMatch[1], currentUrl);
        }
      } else if (line.startsWith('#EXTINF:')) {
        let j = i + 1;
        while (j < lines.length && (lines[j].trim().startsWith('#') || lines[j].trim() === '')) {
          j += 1;
        }
        if (j < lines.length) {
          segments.push({
            url: DownloaderUtils.resolveSecureUrl(lines[j].trim(), currentUrl),
            keyUrl: currentKeyUrl,
            ivHex: currentIVHex,
            sequence: mediaSequence++
          });
        }
      }
    }

    return {
      currentPlaylistUrl: currentUrl,
      initSegmentUrl,
      segments,
      uniqueKeyUrls: Array.from(uniqueKeyUrls)
    };
  }

  /**
   * Downloads, decrypts, and assembles an HLS stream into a local MP4 or MP3 file.
   * @param {string} m3u8Url
   * @param {string} [title="video"]
   * @param {(progress: object) => void} [onProgress]
   * @param {string} [format="mp4"]
   */
  async download(m3u8Url, title = 'video', onProgress = function () {}, format = 'mp4') {
    this.isDownloading = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      onProgress({ stage: 'parsing', percent: 1, text: 'Mapping HLS stream...' });
      await DownloaderUtils.yieldThread();

      const parsed = await this.parseM3U8(m3u8Url, signal);
      const { initSegmentUrl, segments, uniqueKeyUrls } = parsed;

      if (segments.length === 0) {
        throw new Error('No media segments found in M3U8 playlist.');
      }

      // V12 Non-Blocking Async Key Warm-up
      if (uniqueKeyUrls.length > 0) {
        this.preloadKeys(uniqueKeyUrls);
      }

      const finalBuffers = [];

      if (initSegmentUrl) {
        onProgress({ stage: 'init', percent: 2, text: 'Fetching initialization header...' });
        const initRes = await fetch(initSegmentUrl, { credentials: 'omit', signal });
        if (!initRes.ok) {
          throw new Error(`Initialization segment failed (HTTP ${initRes.status})`);
        }
        finalBuffers.push(await initRes.arrayBuffer());
      }

      onProgress({ stage: 'downloading', percent: 3, text: `0/${segments.length} segments...` });

      const total = segments.length;
      const segmentBuffers = new Array(total);
      let nextIndex = 0;
      let downloadedCount = 0;
      let totalBytes = 0;

      const downloadWorker = async () => {
        while (nextIndex < total && !signal.aborted) {
          const i = nextIndex++;
          const seg = segments[i];

          let buffer = null;
          let lastError = null;

          for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
            if (signal.aborted) {
              throw new Error('Download cancelled by user.');
            }
            try {
              const res = await fetch(seg.url, { credentials: 'omit', signal });
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
              }
              buffer = await res.arrayBuffer();
              break;
            } catch (err) {
              lastError = err;
              if (attempt < this.maxRetries) {
                await new Promise((r) => setTimeout(r, 500 * attempt));
              }
            }
          }

          if (!buffer) {
            throw new Error(
              `Segment ${i + 1}/${total} failed: ${lastError ? lastError.message : 'Network error'}`
            );
          }

          if (seg.keyUrl) {
            const cryptoKey = await this.getImportedCryptoKey(seg.keyUrl);
            buffer = await this.decryptSegment(buffer, cryptoKey, seg.sequence, seg.ivHex);
          }

          segmentBuffers[i] = buffer;
          downloadedCount += 1;
          totalBytes += buffer.byteLength;

          if (downloadedCount % 8 === 0) {
            await DownloaderUtils.yieldThread();
          }

          const percent = Math.min(99, Math.round((downloadedCount / total) * 98) + 1);
          onProgress({
            stage: 'downloading',
            percent,
            downloaded: downloadedCount,
            total,
            totalBytes,
            text: `${downloadedCount}/${total} (${DownloaderUtils.formatBytes(totalBytes)})`
          });
        }
      };

      const workers = [];
      const workerCount = Math.min(this.concurrency, total);
      for (let w = 0; w < workerCount; w += 1) {
        workers.push(downloadWorker());
      }

      await Promise.all(workers);

      if (signal.aborted) {
        throw new Error('Download cancelled.');
      }

      const isMp3 = format === 'mp3';
      onProgress({
        stage: 'assembling',
        percent: 99,
        text: isMp3 ? 'Assembling MP3 audio...' : 'Assembling MP4 container...'
      });
      await DownloaderUtils.yieldThread();

      for (let i = 0; i < segmentBuffers.length; i += 1) {
        if (segmentBuffers[i]) {
          finalBuffers.push(segmentBuffers[i]);
        }
      }

      const mimeType = isMp3 ? 'audio/mpeg' : 'video/mp4';
      const fileExt = isMp3 ? '.mp3' : '.mp4';
      const blob = new Blob(finalBuffers, { type: mimeType });
      const safeName = DownloaderUtils.sanitizeFilename(title, isMp3 ? 'Audio' : 'Video') + fileExt;
      const downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 30000);

      onProgress({ stage: 'completed', percent: 100, text: 'Download complete!' });
      this.isDownloading = false;

      return {
        success: true,
        filename: safeName,
        size: blob.size
      };
    } catch (error) {
      this.isDownloading = false;
      onProgress({ stage: 'error', percent: 0, text: `Error: ${error.message}` });
      throw error;
    }
  }
}

if (typeof window !== 'undefined') {
  window.HLSDownloader = HLSDownloader;
}
if (typeof self !== 'undefined') {
  self.HLSDownloader = HLSDownloader;
}
if (typeof global !== 'undefined') {
  global.HLSDownloader = HLSDownloader;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HLSDownloader;
}
