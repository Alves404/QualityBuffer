# Changelog

All notable changes to the **My Quality 4k** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-10-26

### Added
- **SABR & Policy 512 MB Deep Pre-Buffer Unlocker (`src/content/page-hook.js`):**
  - Hooks `Object.prototype.videoTrack` to intercept YouTube's internal `g.vWa` policy object, unlocking the hardcoded 35 MB (`36,700,160` bytes = 16.3s) 4K video buffer cap to **512 MB** (`536,870,912` bytes) and the audio buffer cap to **64 MB** (`67,108,864` bytes).
  - Overrides SABR `NextRequestPolicy` (`targetVideoReadaheadMs` and `targetAudioReadaheadMs`) and advances the reported media position (`mp`) inside active buffered ranges (`bc`) on outgoing `RO()` SABR requests so `googlevideo.com` continuously streams **60s, 120s, or 180s** of 4K video ahead of playback.
  - Actively pumps YouTube's internal loader (`mf()`) until the user-selected multi-minute buffer goal is reached.
- **Baby Blue Dark Theme & Video Player Symbol (`src/popup/`, `assets/icons/`):**
  - Redesigned the Popup UI and extension icons with a Baby Blue (`#89CFF0` / `#B6E3FF`) dark mode aesthetic and a custom Video Player symbol.
- **Official English Documentation Website (`docs/index.html`) & English `README.md`:**
  - Added full English documentation site and updated technical documentation with direct GitHub Release `.zip` download links.
- **SABR `Content-Length` Throughput Inspection (`src/background/service-worker.js`):**
  - Reads `Content-Length` response headers on multiplexed SABR `videoplayback` responses to compute exact Mbps throughput and chunk sizes.

### Fixed
- Resolved `Uncaught Error: Extension context invalidated` in `src/content/content-controller.js` when reloading the extension while a YouTube tab remains open.

---

## [2.0.0] - 2026-10-26

### Added
- **Zero-Track-Laying Bootstrap:** Spoofs `navigator.connection` (`100 Mbps / 5ms RTT`) and pre-seeds `localStorage` and `sessionStorage` (`yt-player-quality = 2160`) before player initialization.
- **MediaCapabilities Hardware Certification:** Hooks `navigator.mediaCapabilities.decodingInfo` to certify 4K VP9 Profile 0 SDR as hardware-smooth and power-efficient.
- **Headstart Buffer Boost & Main-Thread Telemetry Blocker:** Optional initial 4K buffer cushion at second zero and short-circuiting of heavy YouTube tracking beacons (`/youtubei/v1/log_event`, `/api/stats/qoe`, `/ptracking`) while preserving `/api/stats/watchtime`.

---

## [1.0.0] - 2026-10-26

### Added
- **Chrome Extension Manifest V3 (`manifest.json`):** Dual-world (`MAIN` and `ISOLATED`) architecture.
- **Hardware Codec Filter (`src/content/page-hook.js`):** Blocks software-decoded `AV1` (`av01`), `VP9 Profile 2 HDR 10-bit`, and optional `60fps` streams (`30fps` limiter) to enforce hardware-accelerated `VP9 Profile 0 SDR` in 4K (`2160p`).
- **MSE Buffer Stabilizer:** Automatic detection and recovery of timestamp micro-gaps between segments.
- **GPU Compositor Optimizer (`src/content/player-optimize.css`):** Disables YouTube Ambient Mode (`#cinematic-container`) and promotes `<video>` to a dedicated hardware layer.
- **Local Telemetry Backend (`backend/`):** Node.js HTTP ingestion server and Ruby statistical CDN route analyzer.
- **Open Source Governance:** Licensed under GNU GPLv3 (`GPL-3.0`) with an explicit AI-Assisted Engineering Transparency Notice crediting **Argon (Google Antigravity)**.
