/**
 * My Quality 4k - Media & HLS Downloader Utilities
 *
 * URL token preservation (V12 resolveSecureUrl), AES-128 IV parsing,
 * filename sanitization, byte formatting, and non-blocking event-loop yielding.
 *
 * Assisted engineering by Gemini 4 Argon (Google Antigravity).
 * License: GPL-3.0
 */

'use strict';

const DownloaderUtils = {
  /**
   * Resolves a relative URL against a base URL while preserving CDN authentication
   * query parameters and signed tokens from the base URL (V12 pattern).
   * @param {string} relativePath
   * @param {string} baseUrlString
   * @returns {string}
   */
  resolveSecureUrl(relativePath, baseUrlString) {
    if (!relativePath) {
      return '';
    }
    try {
      const baseUrl = new URL(baseUrlString);
      const resolvedUrl = new URL(relativePath, baseUrl);

      if (!resolvedUrl.search && baseUrl.search) {
        resolvedUrl.search = baseUrl.search;
      } else if (baseUrl.search) {
        baseUrl.searchParams.forEach(function (val, key) {
          if (!resolvedUrl.searchParams.has(key)) {
            resolvedUrl.searchParams.append(key, val);
          }
        });
      }
      return resolvedUrl.href;
    } catch (e) {
      return relativePath;
    }
  },

  /**
   * Converts a hexadecimal string into a 16-byte Uint8Array for AES-128-CBC IVs.
   * @param {string} hexString
   * @returns {Uint8Array}
   */
  hexToUint8Array(hexString) {
    if (!hexString) {
      return new Uint8Array(16);
    }
    let str = String(hexString).replace(/^0x/i, '');
    if (str.length % 2 !== 0) {
      str = '0' + str;
    }
    const iv = new Uint8Array(16);
    const len = Math.min(16, str.length / 2);
    for (let i = 0; i < len; i += 1) {
      iv[i] = parseInt(str.substring(i * 2, i * 2 + 2), 16);
    }
    return iv;
  },

  /**
   * Sanitizes a filename by stripping characters forbidden by OS file systems.
   * @param {string} name
   * @param {string} [fallback="video"]
   * @returns {string}
   */
  sanitizeFilename(name, fallback = 'video') {
    if (!name || typeof name !== 'string') {
      return `${fallback}_${Date.now()}`;
    }
    let clean = name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length === 0) {
      clean = fallback;
    }
    if (clean.length > 120) {
      clean = clean.substring(0, 120).trim();
    }
    return clean;
  },

  /**
   * Formats byte counts into human-readable units (B, KB, MB, GB).
   * @param {number} bytes
   * @param {number} [decimals=1]
   * @returns {string}
   */
  formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes <= 0) {
      return '0 B';
    }
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * Yields the main thread briefly (5ms V12 pattern) so concurrent high-resolution
   * video playback and UI rendering never stutter during heavy segment processing.
   * @param {number} [ms=5]
   * @returns {Promise<void>}
   */
  yieldThread(ms = 5) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  },

  /**
   * Cleans ephemeral chunk and byte-range parameters from media URLs (e.g. googlevideo.com)
   * so the URL requests the complete stream from byte 0 to EOF.
   * @param {string} rawUrl
   * @returns {string}
   */
  cleanStreamUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return '';
    }
    try {
      const parsed = new URL(rawUrl);
      parsed.searchParams.delete('range');
      parsed.searchParams.delete('rn');
      parsed.searchParams.delete('rbuf');
      parsed.searchParams.delete('sq');
      return parsed.toString();
    } catch (e) {
      return rawUrl
        .replace(/[?&]range=[^&]+/g, '')
        .replace(/[?&]rn=[^&]+/g, '')
        .replace(/[?&]rbuf=[^&]+/g, '')
        .replace(/[?&]sq=[^&]+/g, '');
    }
  },

  /**
   * Returns metadata and user-friendly labels for YouTube itags and formats.
   * @param {string|number} itag
   * @param {string} [mime=""]
   * @returns {{ quality: string, label: string, ext: string, isMuxed: boolean } | null}
   */
  classifyYouTubeItag(itag, mime = '') {
    const tagStr = String(itag || '');
    const ITAG_MAP = {
      '18': { quality: '360p', label: 'YouTube MP4 (360p - Áudio + Vídeo)', ext: 'mp4', isMuxed: true },
      '22': { quality: '720p HD', label: 'YouTube MP4 (720p HD - Áudio + Vídeo)', ext: 'mp4', isMuxed: true },
      '137': { quality: '1080p', label: 'YouTube 1080p Full HD (MP4 - Vídeo)', ext: 'mp4', isMuxed: false },
      '136': { quality: '720p', label: 'YouTube 720p HD (MP4 - Vídeo)', ext: 'mp4', isMuxed: false },
      '135': { quality: '480p', label: 'YouTube 480p (MP4 - Vídeo)', ext: 'mp4', isMuxed: false },
      '248': { quality: '1080p', label: 'YouTube 1080p Full HD (WebM - Vídeo)', ext: 'webm', isMuxed: false },
      '271': { quality: '1440p 2K', label: 'YouTube 1440p 2K (WebM - Vídeo)', ext: 'webm', isMuxed: false },
      '313': { quality: '2160p 4K', label: 'YouTube 2160p 4K (WebM - Vídeo)', ext: 'webm', isMuxed: false },
      '315': { quality: '2160p 4K 60fps', label: 'YouTube 2160p 4K 60fps (WebM - Vídeo)', ext: 'webm', isMuxed: false },
      '140': { quality: 'Audio', label: 'YouTube Áudio (M4A / AAC 128kbps)', ext: 'm4a', isMuxed: false },
      '251': { quality: 'Audio', label: 'YouTube Áudio (WebM / Opus 160kbps)', ext: 'webm', isMuxed: false }
    };
    if (ITAG_MAP[tagStr]) {
      return ITAG_MAP[tagStr];
    }
    const lowerMime = (mime || '').toLowerCase();
    if (lowerMime.startsWith('audio/')) {
      const ext = lowerMime.includes('webm') ? 'webm' : 'm4a';
      return { quality: 'Audio', label: `YouTube Áudio (${ext.toUpperCase()})`, ext: ext, isMuxed: false };
    }
    if (lowerMime.startsWith('video/')) {
      const ext = lowerMime.includes('webm') ? 'webm' : 'mp4';
      return { quality: 'Video', label: `YouTube Vídeo (${ext.toUpperCase()})`, ext: ext, isMuxed: false };
    }
    return null;
  }
};

if (typeof window !== 'undefined') {
  window.DownloaderUtils = DownloaderUtils;
}
if (typeof self !== 'undefined') {
  self.DownloaderUtils = DownloaderUtils;
}
if (typeof global !== 'undefined') {
  global.DownloaderUtils = DownloaderUtils;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DownloaderUtils;
}
