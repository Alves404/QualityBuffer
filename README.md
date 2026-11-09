# My Quality 4k

[![Latest Release](https://img.shields.io/badge/Release-v2.2.0-89CFF0.svg)](https://github.com/Alves404/My-Quality-4k/releases/latest)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-5bb5e6.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-89CFF0.svg)](manifest.json)
[![Stack: JavaScript](https://img.shields.io/badge/Engine-Vanilla_JS_V12-b6e3ff.svg)](src/)

**My Quality 4k** is a standalone Open Source browser extension engineered to deliver smooth, stutter-free **4K (2160p)** YouTube video playback on entry-level and mid-range computers, paired with an integrated **V12 12-Worker HLS (`M3U8` / `AES-128`) & Direct `MP4`/`WebM` Web Video Downloader**.

By combining **SABR (Server-Driven Adaptive Bitrate) & Policy Byte-Cap Unlocking (512 MB)**, **V12 Async CDN & Key Warm-up**, **MediaSource Extensions (MSE) Buffer Stabilization**, and **Hardware Codec Enforcement (VP9 Profile 0 SDR)**, the extension eliminates CPU decoding bottlenecks and pre-buffers **1, 2, or 3 full minutes** of upcoming 4K video ahead of the playhead.

---

## Direct Download & Documentation

* **Download Latest Release (v2.2.0 Ready-to-Use ZIP):** [My-Quality-4k-v2.2.0.zip](https://github.com/Alves404/My-Quality-4k/releases/download/v2.2.0/My-Quality-4k-v2.2.0.zip)
* **Chrome Web Store Submission Package (ZIP):** [My-Quality-4k-ChromeWebStore-v2.2.0.zip](https://github.com/Alves404/My-Quality-4k/releases/download/v2.2.0/My-Quality-4k-ChromeWebStore-v2.2.0.zip)
* **All GitHub Releases:** [github.com/Alves404/My-Quality-4k/releases](https://github.com/Alves404/My-Quality-4k/releases)
* **Privacy Policy (Chrome Web Store Compliance):** [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md)
* **Documentation Website:** [`docs/index.html`](docs/index.html)
* **Engineering Technical Report:** [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md)

---

## Table of Contents

1. [The Engineering Problem & Solution](#1-the-engineering-problem--solution)
2. [Key Features (v2.2.0)](#2-key-features-v220)
3. [V12 Async Warm-up & HLS/MP4 Downloader Architecture](#3-v12-async-warm-up--hlsmp4-downloader-architecture)
4. [Simplified Repository Structure](#4-simplified-repository-structure)
5. [Installation & Verification Guide](#5-installation--verification-guide)
6. [AI-Assisted Development Notice (Gemini 4 Argon)](#6-ai-assisted-development-notice-gemini-4-argon)
7. [Credits & Authorship](#7-credits--authorship)

---

## 1. The Engineering Problem & Solution

Many computers equipped with 4-core processors (e.g., Intel Core i3) and entry-level 4 GB VRAM graphics cards (e.g., AMD Radeon RX 550 or integrated GPUs) have more than enough internet bandwidth to stream 4K video (25 to 50 Mbps), yet suffer from severe stuttering, frame drops, and constant rebuffering due to four architectural bottlenecks:

1. **Hardcoded 35 MB (16-Second) 4K Buffer Ceiling in YouTube's SABR Scheduler:**
   When streaming above 1080p (`qualityOrdinal > 1080`), YouTube's internal player policy (`g.vWa` / `fPa`) caps the video buffer pool at `36,700,160` bytes (**35 MB** = **16.3 seconds**). **My Quality 4k** intercepts the internal player policy via `Object.prototype.videoTrack` to expand the video byte cap to **512 MB** (`536,870,912` bytes), audio byte cap to **64 MB**, and dynamically advances the SABR request horizon so `googlevideo.com` streams **60s, 120s, or 180s** of upcoming 4K video continuously.
2. **Software AV1 CPU Decoding Overload:**
   YouTube prioritizes `AV1` (`av01`) for 4K streams. GPUs without a dedicated hardware AV1 decoder offload decoding entirely to software (`dav1d`) on the CPU. **My Quality 4k** hooks `MediaSource.isTypeSupported`, `HTMLMediaElement.prototype.canPlayType`, and `navigator.mediaCapabilities.decodingInfo` to block `av01` and 10-bit HDR (`vp09.02`), forcing hardware-accelerated **VP9 Profile 0 (8-bit SDR)** (`itag=313` / `itag=315`).
3. **MSE SourceBuffer Micro-Gaps & First-Byte CDN Latency:**
   Millisecond timestamp discontinuities between adjacent segments in the MSE `SourceBuffer` cause `<video>` stalls (`readyState < 3`). The extension bridges micro-gaps automatically while using **V12 Async CDN Warm-up** (`dns-prefetch` + `preconnect` across both `fetch` and `XMLHttpRequest` pipelines at millisecond zero) to eliminate initial TLS/QUIC handshake delays.
4. **Background Shader & Main-Thread Beacon Overhead:**
   YouTube's "Ambient Mode" (`#cinematic-container`) and periodic `/youtubei/v1/log_event` / `/api/stats/qoe` diagnostic payloads are neutralized automatically while preserving playback attribution.

> [!TIP]
> **Beneficial Side-Effect on Sub-4K Videos (1440p / 1080p / 720p):**
> Because sub-4K streams require vastly lower bitrates (2–5 Mbps for 1080p vs. 25–45 Mbps for 4K), the 512 MB buffer pool caches the entire 1, 2, or 3 upcoming minutes in just seconds, ensuring instant seeking and buffer-free playback.

---

## 2. Key Features (v2.2.0)

* **SABR & Policy Deep Pre-Buffer Unlocker (60s / 120s / 180s):** Unlocks YouTube's 35 MB (16-second) 4K buffer limit to 512 MB and continuously pumps upcoming minutes ahead of playback.
* **V12 12-Worker HLS (`M3U8` / `AES-128`) & Direct `MP4`/`WebM` Downloader:** Integrated **Downloader** tab in the popup that detects web video streams on active pages, selects the highest-bandwidth `#EXT-X-STREAM-INF` stream, pre-warms `AES-128` decryption keys asynchronously in WebCrypto, and downloads with 12 concurrent workers without stuttering active video playback.
* **V12 Dual Fetch & XHR Millisecond-Zero CDN Warm-up:** Hooks both `window.fetch` and `XMLHttpRequest.prototype.open` plus `streamingData.adaptiveFormats` at `document_start` to pre-warm high-resolution CDN edge nodes before the first video chunk is requested.
* **Hardware Codec Enforcement (AV1 & HDR10 Blocker) & Optional 30fps Limiter:** Certifies 4K `VP9 Profile 0 SDR` for GPU hardware decoding and optionally caps streams at 30fps to relieve 4 GB VRAM GPUs.
* **MSE Buffer Stabilizer & Smart Drop Guard:** Automatically steps over sub-second timestamp gaps and optionally steps down from 4K to 2K (`1440p`) only if frame drops exceed 18%.
* **Zero-Telemetry Standalone Privacy:** 100% self-contained in the browser with zero external servers, zero analytics, and zero background data collection.
* **Pure Black OLED UI (`#050505`), Gemini Light Blue (`#A8C7FA`) Accents & `EN`/`PT`/`ES` i18n:** 3-tab interface (`Controls` + `Downloader` + `About & Credits`) with a frozen `O(1)` dictionary and **Zero-Reload "Apply Now" Engine**.

---

## 3. V12 Async Warm-up & HLS/MP4 Downloader Architecture

The **V12 (`Async Warm-up & Max Agility`)** engine improves both high-resolution streaming and media downloading through five core mechanisms:

1. **Dual `fetch` + `XMLHttpRequest.prototype.open` Interception (`page-hook.js`):** Captures media segment and manifest requests across both modern Fetch and legacy XHR players at `document_start`.
2. **Non-Blocking Async Key & CDN Warm-up (`hls-downloader.js` & `page-hook.js`):** Fires background `dns-prefetch`/`preconnect` for 4K CDN nodes on arrival of `adaptiveFormats`, and pre-fetches + imports `AES-128` keys into `crypto.subtle` in background Promises so segment workers experience zero crypto initialization lag.
3. **Highest-Bandwidth Master Playlist Selection (`#EXT-X-STREAM-INF`):** Parses HLS Master Playlists to select the highest resolution/bandwidth variant while preserving signed CDN query tokens (`DownloaderUtils.resolveSecureUrl`).
4. **12-Connection Worker Pool + `yieldThread(5ms)` Anti-Stutter:** Downloads up to 12 segments in parallel while yielding the main event loop every 5ms during parsing, decryption batches, and MP4 Blob assembly so simultaneous 4K playback never drops frames.
5. **SPA Route Change Watcher (`location.href`):** Automatically clears stale streams and rescans when navigating between lessons or videos on Single-Page Applications without a full page reload.

---

## 4. Simplified Repository Structure

```text
My-Quality-4k/
├── manifest.json                 # Chrome Extension Manifest V3 configuration (v2.2.0, CWS compliant)
├── package.json                  # Unit test, syntax verification, and CWS packager scripts
├── PRIVACY_POLICY.md             # Zero-Data-Collection Privacy Policy for Chrome Web Store
├── LICENSE                       # GNU GPLv3 (Copyleft Open Source) License
├── README.md                     # Main documentation
├── CHANGELOG.md                  # Version history and release notes
├── chrome-web-store/             # Dedicated Chrome Web Store publication folder & ready-to-upload ZIP
│   ├── My-Quality-4k-CWS/        # Clean unpacked production build for Chrome Web Store
│   ├── My-Quality-4k-ChromeWebStore-v2.2.0.zip
│   └── STORE_LISTING_GUIDE.md    # Ready-to-paste CWS Privacy & Permission justifications
├── scripts/
│   └── build-cws.js              # Automated Chrome Web Store validator & ZIP packager
├── assets/
│   ├── icons/                    # Pure Black & Gemini Light Blue Play Triangle icons (16, 32, 48, 128px)
│   └── images/                   # README visual assets
├── src/
│   ├── background/
│   │   └── service-worker.js     # Passive 4K CDN speed calculator & Web Video/HLS detector
│   ├── core/
│   │   ├── utils.js              # URL token resolver, AES-128 IV parser & event-loop yielder
│   │   └── hls-downloader.js     # V12 12-worker HLS (M3U8/AES-128) downloader & MP4 assembler
│   ├── content/
│   │   ├── page-hook.js          # MAIN world engine: SABR 512MB Unlocker, V12 Warm-up & Codec hooks
│   │   ├── content-controller.js # ISOLATED world bridge, DOM/SPA video scanner & HLS runner
│   │   └── player-optimize.css   # GPU layer promotion & Ambient Mode neutralizer
│   └── popup/
│       ├── popup.html            # 3-Tab Controls, Downloader & About interface (EN default)
│       ├── popup.css             # Pure Black (#050505) & Gemini Light Blue (#A8C7FA) stylesheet
│       └── popup.js              # Popup controller, Downloader UI & O(1) i18n (EN/PT/ES)
├── tests/
│   └── test-core.js              # Automated unit tests for DownloaderUtils & V12 HLSDownloader
└── docs/
    ├── index.html                # Official Documentation & Release Download Website
    └── TECHNICAL_REPORT.md       # Deep-dive Engineering & Open Source Compliance Report
```

---

## 5. Installation & Verification Guide

### Option A: Quick Install via GitHub Release (Recommended)

1. Download [**My-Quality-4k-v2.2.0.zip**](https://github.com/Alves404/My-Quality-4k/releases/download/v2.2.0/My-Quality-4k-v2.2.0.zip) from the [Latest Release](https://github.com/Alves404/My-Quality-4k/releases/latest) page and extract it to a folder on your computer.
2. Open Google Chrome (or Brave / Edge) and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner and select the extracted folder (containing `manifest.json`).

### Option B: Clone & Verify from Source

```bash
git clone https://github.com/Alves404/My-Quality-4k.git
cd My-Quality-4k
npm test
npm run verify
```

---

## 6. AI-Assisted Development Notice (Gemini 4 Argon)

<p align="center">
  <img src="assets/images/gemini-4-argon.jpg" alt="Gemini 4 Argon" width="600">
</p>

This software was conceived, designed, and architected by its human author (**Joao Vitor Alves** — Google Student Ambassador 2026). The implementation of technical modules, low-level MSE/SABR optimizations, V12 async downloader algorithms, and documentation were developed with the direct pair-programming assistance of **Gemini 4 Argon (Google Antigravity)** acting as an AI engineering assistant under human direction and supervision.

---

## 7. Credits & Authorship

* **Creator, Software Architect & Maintainer:** Joao Vitor Alves — **Google Student Ambassador 2026** — [github.com/Alves404](https://github.com/Alves404) (`@Alves404`)
* **Official Open Source Repository:** [github.com/Alves404/My-Quality-4k](https://github.com/Alves404/My-Quality-4k)
* **AI-Assisted Development:** Gemini 4 Argon (Google Antigravity) — AI programming assistant for technical implementation, optimizations, and documentation under human direction
* **Supported Languages (Zero-Overhead):** English (`EN` - Default), Portugues (`PT`), and Espanol (`ES`) with automatic browser detection
* **License:** GNU General Public License v3.0 (`GPL-3.0` Copyleft Open Source)
* **Version:** `2.2.0` (Manifest V3 — 512 MB SABR Pre-Buffer, Hardware VP9 SDR & V12 HLS/MP4 Downloader)

<sub>*Google Gemini is a trademark of Google LLC, and this project is not affiliated with or endorsed by Google.*</sub>
