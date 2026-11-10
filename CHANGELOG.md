# Changelog

All notable changes to the **My Quality 4k** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.1] - 2026-11-09

### Changed
- **Chrome Web Store Policy Compliance (YouTube Downloader Restriction):**
  - Restricted the built-in media downloader on `youtube.com` and `googlevideo.com` domains to strictly comply with Chrome Web Store Developer Program Policies regarding YouTube content.
  - Added a dedicated compliance notice in the popup Downloader tab when active on YouTube pages.
  - Video and audio downloading remains fully functional for standard web pages (HLS `.m3u8` and direct MP4/WebM).
  - All 4K playback optimizations on YouTube (512 MB SABR buffer, hardware VP9 SDR decoding, MSE stabilization, Ambient Mode disabling, and live telemetry) remain 100% active.
- **Logo & Toolbar Icon Enhancement:**
  - Replaced the previous checkmark emblem with an optimized Material 3 repeat/loading loop symbol (`🔁`).
  - Added programmatic runtime icon enforcement (`applyToolbarIcon`) in the Background Service Worker.

---

## [2.2.0] - 2026-11-08

### Added
- **V12 12-Worker HLS (`M3U8` / `AES-128`) & Direct `MP4`/`WebM` Web Video Downloader (`src/core/utils.js`, `src/core/hls-downloader.js`, `src/content/content-controller.js`, `src/background/service-worker.js`):**
  - Integrated full media detection (`chrome.webRequest` + DOM `<video>`/`<source>` MutationObserver + SPA `location.href` route watcher) for non-YouTube web pages.
  - Added the **V12 (`Async Warm-up & Max Agility`)** HLS engine featuring automatic highest-bandwidth (`#EXT-X-STREAM-INF`) variant selection, CDN query token preservation (`resolveSecureUrl`), non-blocking background WebCrypto `AES-128` key fetch/import warm-up, 12-connection parallel segment downloading with automatic retry backoff, and 5ms main-thread yielding (`yieldThread`) so active 4K playback never drops frames during downloads.
- **V12 Millisecond-Zero CDN Warm-up & Dual Fetch/XHR Hooks (`src/content/page-hook.js`):**
  - Hooked `XMLHttpRequest.prototype.open` alongside `window.fetch` at `document_start` and added instant `dns-prefetch` + `preconnect` warm-up for high-resolution video/audio CDN origins discovered in `streamingData.adaptiveFormats`.
- **3-Tab Popup Interface with Downloader Tab (`src/popup/`):**
  - Added the **Downloader** tab to the Pure Black (`#050505`) & Gemini Light Blue (`#A8C7FA`) popup interface with live detected video badge counters, real-time progress bars, and zero-overhead `EN`/`PT`/`ES` translations.
- **Automated Core Unit Test Suite (`tests/test-core.js`):**
  - Added unit tests for URL token preservation, AES-128 16-byte IV conversion, filename sanitization, byte formatting, and M3U8 Master/Media playlist parsing.

### Removed
- **Simplified Repository & Removed Local Telemetry Suite:**
  - Removed the `backend/` directory (Node.js HTTP ingestion server and Ruby statistical analyzer) and the popup telemetry sync toggle to ensure a lightweight, 100% standalone user-focused extension with zero telemetry features.

---

## [2.1.0] - 2026-10-26

### Added
- **SABR & Policy 512 MB Deep Pre-Buffer Unlocker (`src/content/page-hook.js`):**
  - Hooks `Object.prototype.videoTrack` to intercept YouTube's internal `g.vWa` policy object, unlocking the hardcoded 35 MB (`36,700,160` bytes = 16.3s) 4K video buffer cap to **512 MB** (`536,870,912` bytes) and the audio buffer cap to **64 MB** (`67,108,864` bytes).
  - Overrides SABR `NextRequestPolicy` (`targetVideoReadaheadMs` and `targetAudioReadaheadMs`) and advances the reported media position (`mp`) inside active buffered ranges (`bc`) on outgoing `RO()` SABR requests so `googlevideo.com` continuously streams **60s, 120s, or 180s** of 4K video ahead of playback.
- **Zero-Overhead Multi-Language Support (`EN` / `PT` / `ES`) (`src/popup/`):**
  - Added static frozen `O(1)` dictionary (`I18N_DICT`) supporting **English (`EN`, default)**, **Portuguese (`PT`)**, and **Spanish (`ES`)** with automatic browser locale detection.
- **Pure Black (`#050505`) Theme, Gemini Light Blue (`#A8C7FA`) Accents & Play Triangle Logo (`src/popup/`, `assets/icons/`):**
  - Designed the high-contrast Popup UI with a **Zero-Reload "Apply Now" Engine** and **Green/Red Switch-Style Status Indicator**.

---

## [2.0.0] - 2026-10-26

### Added
- **Zero-Track-Laying Bootstrap:** Spoofs `navigator.connection` (`100 Mbps / 5ms RTT`) and pre-seeds `localStorage` and `sessionStorage` (`yt-player-quality = 2160`) before player initialization.
- **MediaCapabilities Hardware Certification:** Hooks `navigator.mediaCapabilities.decodingInfo` to certify 4K VP9 Profile 0 SDR as hardware-smooth and power-efficient.

---

## [1.0.0] - 2026-10-26

### Added
- **Chrome Extension Manifest V3 (`manifest.json`):** Dual-world (`MAIN` and `ISOLATED`) architecture.
- **Hardware Codec Filter (`src/content/page-hook.js`):** Blocks software-decoded `AV1` (`av01`), `VP9 Profile 2 HDR 10-bit`, and optional `60fps` streams (`30fps` limiter) to enforce hardware-accelerated `VP9 Profile 0 SDR` in 4K (`2160p`).
- **MSE Buffer Stabilizer:** Automatic detection and recovery of timestamp micro-gaps between segments.
- **GPU Compositor Optimizer (`src/content/player-optimize.css`):** Disables YouTube Ambient Mode (`#cinematic-container`) and promotes `<video>` to a dedicated hardware layer.
