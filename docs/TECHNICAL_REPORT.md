# Engineering Technical Report & Open Source Compliance — My Quality

**Project:** My Quality  
**Version:** 2.2.1 (SABR 512 MB Policy Unlocker, Hardware Codec Engine & V12 HLS/MP4 Downloader)  
**Target Platform:** Google Chrome / Chromium (Manifest V3)  
**License:** GNU General Public License v3.0 (GPL-3.0 / Copyleft Open Source)  
**Repository:** `https://github.com/Alves404/My-Quality-4k`

---

## 1. Executive Summary

**My Quality** is a 100% standalone Open Source browser extension. Its primary engineering goals are:
1. Enabling entry-level and mid-range computers to play **4K (2160p)** YouTube videos smoothly without rebuffering stalls by unlocking YouTube's internal SABR buffer limits (`60s`, `120s`, or `180s` ahead), pre-warming CDN nodes at millisecond zero, stabilizing `MediaSource Extensions (MSE)` buffers, and enforcing hardware-accelerated `VP9 SDR` decoding.
2. Providing an integrated **V12 (`Async Warm-up & Max Agility`) 12-Worker HLS (`M3U8` / `AES-128`) & Direct `MP4`/`WebM` Web Video Downloader** for standard web pages and learning platforms.

---

## 2. Engineering Root-Cause Analysis: Why 4K Stalls on Modest PCs & Stops Buffering at 16 Seconds

On computers equipped with 4-core CPUs, 8 GB of RAM, and entry-level 4 GB VRAM GPUs, standard 4K playback suffers from four critical bottlenecks:

### 2.1. YouTube's Hardcoded 35 MB (16.3-Second) 4K Buffer Cap & Server-Driven ABR (SABR)
In modern YouTube (`base.js`), adaptive streams are delivered via `serverAbrStreamingUrl` (`useServerDrivenAbr: true`). Two mechanisms cap 4K pre-buffering at ~16 seconds:
1. **Client-Side Byte Cap (`fPa` / `kO`):** When `b.video.qualityOrdinal > 1080`, `fPa` sets `a.policy.ya = 36700160` bytes (**35 MB** = **16.3 seconds**).
2. **Server-Side NextRequestPolicy (`Owa` / `JRa` / `RO`):** Google's `googlevideo.com` server returns UMP part #35 (`Owa`) with `targetVideoReadaheadMs: 15000` (15 seconds) and stops transmitting video slices once `(bufferedEndMs - mp) >= 16000 ms`.

**Implemented Solution (`src/content/page-hook.js`):**
- Hooks `Object.prototype.videoTrack` to capture YouTube's internal `policy` (`g.vWa`), `loader` (`AWa`), and SABR coordinator (`qkb`).
- Locks `policy.ya` to **512 MB** (`536,870,912` bytes), `policy.Ta` to **64 MB** (`67,108,864` bytes), and `policy.sb` / `policy.ha` to the user's configured `targetBufferSec` (`60s`, `120s`, or `180s`).
- Wraps the SABR coordinator prototype methods (`Mq` and `RO`) so `targetVideoReadaheadMs` and `targetAudioReadaheadMs` are boosted to `targetBufferSec * 1000`, `UF`/`TF` byte budgets report 512 MB / 64 MB, and the outgoing media position (`mp`) advances inside the active buffered range (`bc`) until the full multi-minute buffer target is reached.

### 2.2. Hardware Codec Incompatibility with AV1 (`av01`) and 10-bit HDR (`vp09.02`)
Intercepts `MediaSource.isTypeSupported()`, `HTMLMediaElement.prototype.canPlayType()`, and `navigator.mediaCapabilities.decodingInfo()` in the `MAIN` world at `document_start`. Rejects `av01`, `vp09.02` (10-bit HDR), and optionally `framerate > 30` (30fps Limiter), while certifying **VP9 Profile 0 (8-bit SDR)** as `{ supported: true, smooth: true, powerEfficient: true }`.

### 2.3. MSE SourceBuffer Micro-Gaps & Compositor Overhead
Inspects `video.buffered` ranges to automatically step over sub-second timestamp gaps (`nextGapStart + 0.02s`), disables GPU-heavy Ambient Mode (`#cinematic-container`), and short-circuits main-thread diagnostic beacons (`/youtubei/v1/log_event`, `/api/stats/qoe`) while preserving `/api/stats/watchtime`, `/ptracking`, and `/api/stats/atr`.

---

## 3. V12 Async Warm-up & 12-Worker HLS/MP4 Downloader Engine

In version `2.2.1`, the **V12 (`Async Warm-up & Max Agility`)** architecture was integrated across both playback optimization and media downloading:

1. **Dual `fetch` + `XMLHttpRequest.prototype.open` Hook & Millisecond-Zero CDN Warm-up (`src/content/page-hook.js`):**
   Pre-warms high-resolution CDN origins (`dns-prefetch` + `preconnect`) immediately when `streamingData.adaptiveFormats` is parsed or when `fetch`/`XMLHttpRequest` requests media segments, eliminating 150–400ms of initial handshake latency.
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

## 5. AI-Assisted Development Notice (Gemini 4 Argon)

Prior to formal authorship credits, it is transparently declared for technical and Open Source compliance that the SABR 512 MB policy unlocking architecture, the V12 Async Warm-up & 12-worker HLS/MP4 downloader engine, the `MediaSource` codec interception hooks, the MSE micro-gap recovery logic, the zero-overhead multi-language engine, and the technical documentation of this repository were designed and implemented with the direct AI-assisted development of **Gemini 4 Argon (Google Antigravity)**, working in pair programming with the project author.

---

## 6. Credits & Authorship

* **Creator, Lead Author & Maintainer:** Joao Vitor Magalhaes Alves — [github.com/Alves404](https://github.com/Alves404) (`@Alves404`)
* **Official Repository:** [github.com/Alves404/My-Quality-4k](https://github.com/Alves404/My-Quality-4k)
* **AI-Assisted Development:** Gemini 4 Argon (Google Antigravity)
* **Supported Languages (Zero-Overhead):** English (`EN` - Default), Portugues (`PT`), Espanol (`ES`)
* **License:** GNU General Public License v3.0 (`GPL-3.0` Copyleft Open Source)
* **Version:** `2.2.1` (Manifest V3 — 512 MB SABR Deep Pre-Buffer, Hardware VP9 SDR & V12 HLS/MP4 Downloader)
