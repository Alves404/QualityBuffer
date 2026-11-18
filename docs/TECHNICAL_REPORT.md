# Engineering Technical Report & Open Source Compliance — QualityBuffer

**Project:** QualityBuffer  
**Version:** 2.3.1 (Safe Hardware VP9 Engine, Adaptive Stability Guard & V12 HLS/MP4 Downloader)  
**Target Platform:** Google Chrome / Chromium (Manifest V3)  
**License:** GNU General Public License v3.0 (GPL-3.0 / Copyleft Open Source)  
**Repository:** `https://github.com/Alves404/QualityBuffer`

---

## 1. Executive Summary

**QualityBuffer** is a 100% standalone Open Source browser extension. Its primary engineering goals are:
1. Enabling entry-level and mid-range computers to play **4K (2160p)** and HD YouTube videos smoothly without Playback Errors or CPU decoding spikes by using non-destructive `MediaCapabilities` hardware `VP9 SDR` preference, ad-safe official player quality control, passive `PerformanceObserver` CDN preconnect warm-up, and adaptive frame-drop/rebuffer protection.
2. Providing an integrated **V12 (`Async Warm-up & Max Agility`) 12-Worker HLS (`M3U8` / `AES-128`) & Direct `MP4`/`WebM` Web Video Downloader** for external web pages and learning platforms.

---

## 2. Engineering Architecture: Safe 4K Playback Optimization Without Protocol Tampering

On computers equipped with 4-core CPUs, 8 GB of RAM, and entry-level 4 GB VRAM GPUs, standard 4K playback suffers from three critical bottlenecks that QualityBuffer v2.3.0 resolves using strictly standard, Terms-of-Service-compliant APIs:

### 2.1. Non-Destructive Hardware Codec Preference (`MediaCapabilities.decodingInfo`)
Instead of returning `false` in `MediaSource.isTypeSupported()` (which causes Playback Errors when a video, Short, or advertisement only offers AV1), `src/content/page-hook.js` awaits the browser's native `navigator.mediaCapabilities.decodingInfo()` result and adjusts only the `smooth` and `powerEfficient` hints (`{ supported: true, smooth: false, powerEfficient: false }`) for software-heavy `av01`, 10-bit HDR (`vp09.02`), and optional `>30fps` streams. YouTube's adaptive selector naturally prefers hardware-accelerated **VP9 Profile 0 (8-bit SDR)** whenever available while keeping AV1-only videos 100% playable.

### 2.2. Ad-Safe Official `#movie_player` Quality Control & Adaptive Stability Guard
Applies the user's preferred resolution (`hd2160`, `hd1440`, `hd1080`) once per video via YouTube's official `#movie_player` API strictly after metadata loads (`video.readyState >= 1`) and never during active advertisements (`ad-showing` / `getAdState() === 1`) or error states. Listens to `onPlaybackQualityChange` to respect manual user gear-menu changes, and monitors real-time dropped frames (`getVideoPlaybackQuality()`) and `waiting` stalls to step down one resolution tier automatically when hardware or network limits are exceeded.

### 2.3. Conservative MSE Micro-Gap Recovery & Compositor Offload
Inspects `video.buffered` ranges to gently step over sub-second timestamp gaps (`nextGapStart + 0.04s`) only after a verified freeze (`>= 2.6s` stationary outside ads/seeking), disables GPU-heavy Ambient Mode (`#cinematic-container`) via CSS (`contain: layout paint`), and pre-warms `googlevideo.com` CDN origins passively via `PerformanceObserver` (`resource`) with zero overrides on `fetch`, `XMLHttpRequest`, or `sendBeacon`.

---

## 3. V12 Async Warm-up & 12-Worker HLS/MP4 Downloader Engine

In version `2.3.1`, the **V12 (`Async Warm-up & Max Agility`)** architecture powers non-blocking external web video downloading and passive CDN warm-up:

1. **Passive `PerformanceObserver` CDN Warm-up (`src/content/page-hook.js`):**
   Observes `resource` timing entries passively to pre-warm active `googlevideo.com` CDN origins (`dns-prefetch` + `preconnect`) with zero overrides on `window.fetch` or `XMLHttpRequest`.
2. **Non-Blocking WebCrypto AES-128 Key Pre-Warming (`src/core/hls-downloader.js`):**
   When downloading an encrypted HLS (`.m3u8`) stream, all unique `#EXT-X-KEY` URLs are fetched and compiled into WebCrypto (`crypto.subtle.importKey`) asynchronously in background Promises (`preloadKeys`) without blocking the 12 segment download workers.
3. **Highest-Bandwidth Variant Resolution & Token Preservation (`src/core/utils.js`):**
   Automatically selects the highest `BANDWIDTH` variant in Master Playlists (`#EXT-X-STREAM-INF`) while preserving signed CDN authentication query tokens (`DownloaderUtils.resolveSecureUrl`).
4. **Main-Thread Event-Loop Yielding (`yieldThread(5ms)`):**
   Yields the browser main thread during playlist parsing, every 8 decrypted segments, and prior to MP4 `Blob` assembly so concurrent 4K video playback remains 100% smooth.

---

## 4. Open Source Compliance Matrix

| Component / File | Applicable License | Compliance Notes |
| :--- | :--- | :--- |
| Extension Source Code (`src/*`, `manifest.json`) | **GNU GPLv3 (GPL-3.0)** | Copyleft Open Source: derivatives must remain open under the same license. |
| Unit Test Suite & Packager (`tests/*`, `scripts/*`) | **GNU GPLv3 (GPL-3.0)** | Zero external runtime dependencies; 100% auditable source code. |
| Documentation (`README.md`, `docs/*`) | **GNU GPLv3 / CC-BY-SA 4.0** | Open, auditable technical documentation. |

---

## 5. Authorship & Engineering Notice

The software architecture, system engineering, buffer allocation heuristics, downloader pipeline, and product decisions were conceived and designed by **Joao Vitor Magalhaes Alves (@Alves404)**. AI tools acted exclusively as development and code review assistants under human direction.

---

## 6. Credits & Authorship

* **Creator, Lead Author & Maintainer:** Joao Vitor Magalhaes Alves — [github.com/Alves404](https://github.com/Alves404) (`@Alves404`)
* **Official Repository:** [github.com/Alves404/QualityBuffer](https://github.com/Alves404/QualityBuffer)
* **Development Assistant:** AI pair programming and code review assistant under human direction
* **Supported Languages (Zero-Overhead):** English (`EN` - Default), Portugues (`PT`), Espanol (`ES`)
* **License:** GNU General Public License v3.0 (`GPL-3.0` Copyleft Open Source)
* **Version:** `2.3.1` (Manifest V3 — Safe Hardware VP9 Engine, Adaptive Stability Guard & V12 HLS/MP4 Downloader)
