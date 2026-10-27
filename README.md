# My Quality 4k

[![Latest Release](https://img.shields.io/badge/Release-v2.1.0-89CFF0.svg)](https://github.com/Alves404/My-Quality-4k/releases/latest)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-5bb5e6.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-89CFF0.svg)](manifest.json)
[![Stack: JavaScript](https://img.shields.io/badge/Front--End-Vanilla_JS-b6e3ff.svg)](src/)
[![Stack: Node.js & Ruby](https://img.shields.io/badge/Back--End-Node.js_%7C_Ruby-89CFF0.svg)](backend/)

**My Quality 4k** is an Open Source browser extension and network telemetry suite engineered to deliver smooth, stutter-free **4K (2160p)** YouTube video playback on entry-level and mid-range computers.

By combining **SABR (Server-Driven Adaptive Bitrate) & Policy Byte-Cap Unlocking**, **MediaSource Extensions (MSE) Buffer Stabilization**, and **Hardware Codec Enforcement (VP9 Profile 0 SDR)**, the extension eliminates CPU decoding bottlenecks and pre-buffers **1, 2, or 3 full minutes** of upcoming 4K video ahead of the playhead—even on modest hardware such as 4-core CPUs and 4 GB VRAM GPUs—whenever a stable internet connection is available.

---

## Direct Download & Documentation

* **Download Latest Release (v2.1.0 Ready-to-Use ZIP):** [My-Quality-4k-v2.1.0.zip](https://github.com/Alves404/My-Quality-4k/releases/download/v2.1.0/My-Quality-4k-v2.1.0.zip)
* **All GitHub Releases:** [github.com/Alves404/My-Quality-4k/releases](https://github.com/Alves404/My-Quality-4k/releases)
* **Documentation Website:** [`docs/index.html`](docs/index.html)
* **Engineering Technical Report:** [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md)

---

## Table of Contents

1. [The Engineering Problem & Solution](#1-the-engineering-problem--solution)
2. [Key Features (v2.1.0)](#2-key-features-v210)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Installation Guide (Release ZIP or Developer Mode)](#5-installation-guide-release-zip-or-developer-mode)
6. [Running the Local Telemetry Services (Node.js & Ruby)](#6-running-the-local-telemetry-services-nodejs--ruby)
7. [Technical Report & Open Source Licensing](#7-technical-report--open-source-licensing)
8. [AI-Assisted Engineering Notice (Argon)](#8-ai-assisted-engineering-notice-argon)
9. [Credits & Authorship](#9-credits--authorship)

---

## 1. The Engineering Problem & Solution

Many computers equipped with 4-core processors (e.g., Intel Core i3) and entry-level 4 GB VRAM graphics cards (e.g., AMD Radeon RX 550 or integrated GPUs) have more than enough internet bandwidth to download 4K streams (25 to 50 Mbps), yet suffer from severe stuttering, frame drops, and constant rebuffering on YouTube due to four architectural bottlenecks:

1. **Hardcoded 35 MB (16-Second) 4K Buffer Ceiling in YouTube's SABR Scheduler:**
   When streaming above 1080p (`qualityOrdinal > 1080`), YouTube's internal player policy (`g.vWa` / `fPa`) caps the video buffer pool at `36,700,160` bytes (**35 MB**). Divided by a 4K stream's average byte rate (`~2.25 MB/s`), the player stops downloading at **16.3 seconds**, while Google's `googlevideo.com` SABR server enforces a `15,000 ms` `targetVideoReadaheadMs` policy. **My Quality 4k** intercepts the internal player policy via `Object.prototype.videoTrack` to expand the video byte cap to **512 MB** (`536,870,912` bytes), audio byte cap to **64 MB**, and dynamically advances the SABR request horizon so `googlevideo.com` streams **60s, 120s, or 180s** of upcoming 4K video continuously.
2. **Software AV1 CPU Decoding Overload:**
   YouTube prioritizes `AV1` (`av01`) for 4K streams. GPUs without a dedicated hardware AV1 decoder offload decoding entirely to software (`dav1d`) on the CPU, spiking processor usage to 100%. **My Quality 4k** hooks `MediaSource.isTypeSupported`, `HTMLMediaElement.prototype.canPlayType`, and `navigator.mediaCapabilities.decodingInfo` to block `av01` and 10-bit HDR (`vp09.02`), forcing hardware-accelerated **VP9 Profile 0 (8-bit SDR)** (`itag=313` / `itag=315`).
3. **MSE SourceBuffer Micro-Gaps:**
   Millisecond timestamp discontinuities between adjacent segments in the MSE `SourceBuffer` cause the HTML5 video element to stall (`readyState < 3`) even when puluhan megabytes are already buffered ahead. The extension's monitor loop detects micro-gaps and bridges them automatically.
4. **Background Shader & Telemetry Overhead:**
   YouTube's "Ambient Mode" (`#cinematic-container`) renders a real-time blurred `<canvas>` that consumes up to 30% of entry-level GPU fill-rate, while periodic `/youtubei/v1/log_event` and `/api/stats/qoe` beacons cause main-thread serialization spikes. Both are neutralized automatically.

---

## 2. Key Features (v2.1.0)

* **SABR & Policy Deep Pre-Buffer Unlocker (60s / 120s / 180s):** Removes YouTube's 35 MB (16-second) 4K buffer limit by locking internal `policy` byte budgets (`ya = 512 MB`, `Ta = 64 MB`), overriding SABR `NextRequestPolicy` (`targetVideoReadaheadMs` / `targetAudioReadaheadMs`), and pumping the internal loader until the user-selected multi-minute horizon is reached.
* **Hardware Codec Enforcement (AV1 & HDR10 Blocker):** Selectively blocks `av01` (AV1) and `vp09.02` (10-bit HDR) across `MediaSource` and `MediaCapabilities` APIs while certifying 4K `VP9 Profile 0 SDR` as `smooth: true, powerEfficient: true`.
* **Optional 30fps Stream Limiter (60fps Blocker):** Halves the number of decoded frames per second on high-framerate gameplay videos to keep 4 GB VRAM GPUs cool and responsive at 2160p.
* **Zero-Track-Laying Bootstrap & CDN Preconnect:** Spoofs `navigator.connection` (`100 Mbps / 5ms RTT`), pre-seeds `yt-player-quality = 2160` in `localStorage`/`sessionStorage` prior to player initialization, and injects `<link rel="preconnect">` for active `*.googlevideo.com` CDN origins.
* **MSE Buffer Stabilizer & Micro-Gap Recovery:** Monitors `SourceBuffer.prototype.appendBuffer` byte volume and automatically steps over sub-second timestamp gaps.
* **Smart 4K Quality Lock (`hd2160`) & Drop Guard:** Locks playback quality on YouTube's `#movie_player` API and includes an optional **Smart Drop Guard** that steps down from 4K to 2K (`1440p`) only if frame drops exceed 18%.
* **Real-Time CDN Throughput & Latency Telemetry (`googlevideo.com`):** Passive `chrome.webRequest` inspection that calculates live CDN throughput (Mbps) and chunk latency (ms) (including multiplexed SABR chunks via `Content-Length` headers) with zero DOM table overhead.
* **Zero-Overhead Multi-Language Support (`EN` / `PT` / `ES`):** Defaults to **English (`EN`)** and automatically selects **English (`EN`)**, **Portuguese (`PT`)**, or **Spanish (`ES`)** based on the user's browser language (`chrome.i18n.getUILanguage()` / `navigator.language`) using a frozen `O(1)` in-memory dictionary inside the popup—incurring zero CPU or memory overhead during YouTube playback.
* **Pure Black OLED UI, Gemini Light Blue Accents & Zero-Reload Live Apply:** High-contrast Pure Black (`#050505`) 2-tab interface (`Controls` + `About & Credits`) accented in Gemini Light Blue (`#A8C7FA`) with a minimalist sideways Play Triangle square logo, featuring a **Zero-Reload "Apply Now" Engine**, a **Green/Red Switch-Style Status Indicator** (Green = Applied, Red = Unapplied Changes), and a collapsible **Features (`Funcionalidades`)** dropdown menu for the 10 buffer/codec modules.
* **Optional Developer Local Telemetry & Route Analysis Backend:** Zero-dependency Node.js HTTP ingestion server and Ruby statistical analyzer for developer CDN route diagnostics (strictly optional; zero impact on normal end-user playback).

---

## 3. Technology Stack

* **Front-End (Browser Extension):**
  * Vanilla JavaScript (ES6+, zero external runtime dependencies, frozen `O(1)` multi-language engine)
  * Chrome Extension Manifest V3 (`MAIN` and `ISOLATED` world content scripts + Background Service Worker)
  * HTML5 & CSS3 (GPU compositor layer isolation & Pure Black `#050505` + Gemini Light Blue `#A8C7FA` Popup UI)
* **Back-End (Local Telemetry & Caching Services):**
  * **Node.js:** Native HTTP server (`backend/node-server/server.js`) on port `3456` for Network Log ingestion and adaptive cache heuristics.
  * **Ruby:** Statistical analyzer (`backend/ruby-analyzer/telemetry_analyzer.rb`) computing P50/P95 bandwidth and latency percentiles across `googlevideo.com` CDN edge nodes.

---

## 4. Repository Structure

```text
My-Quality-4k/
├── manifest.json                 # Chrome Extension Manifest V3 configuration (v2.1.0)
├── package.json                  # Verification and backend execution scripts
├── LICENSE                       # GNU GPLv3 (Copyleft Open Source) License
├── README.md                     # Main English documentation
├── CONTRIBUTING.md               # Open Source contributor guidelines
├── CODE_OF_CONDUCT.md            # Contributor Covenant Code of Conduct
├── CHANGELOG.md                  # Version history and release notes
├── assets/
│   └── icons/                    # Pure Black & Gemini Light Blue Play Triangle icons (16, 32, 48, 128px)
├── src/
│   ├── background/
│   │   └── service-worker.js     # googlevideo.com chunk monitor & throughput calculator
│   ├── content/
│   │   ├── page-hook.js          # MAIN world engine: SABR 512MB Unlocker, Codecs & MSE hooks
│   │   ├── content-controller.js # ISOLATED world bridge for chrome.storage & live apply
│   │   └── player-optimize.css   # GPU layer promotion & Ambient Mode neutralizer
│   └── popup/
│       ├── popup.html            # 2-Tab Control & About interface (EN default)
│       ├── popup.css             # Pure Black (#050505) & Gemini Light Blue (#A8C7FA) stylesheet
│       └── popup.js              # Popup state controller, Zero-Reload Apply & O(1) i18n (EN/PT/ES)
├── backend/
│   ├── data/                     # Persisted network logs and route reports
│   ├── node-server/
│   │   └── server.js             # Node.js HTTP telemetry ingestion server
│   └── ruby-analyzer/
│       └── telemetry_analyzer.rb # Ruby statistical CDN route & cache analyzer
└── docs/
    ├── index.html                # Official Documentation & Release Download Website
    └── TECHNICAL_REPORT.md       # Deep-dive Engineering & Open Source Compliance Report
```

---

## 5. Installation Guide (Release ZIP or Developer Mode)

### Option A: Quick Install via GitHub Release (Recommended)

1. Download [**My-Quality-4k-v2.1.0.zip**](https://github.com/Alves404/My-Quality-4k/releases/download/v2.1.0/My-Quality-4k-v2.1.0.zip) from the [Latest Release](https://github.com/Alves404/My-Quality-4k/releases/latest) page and extract it to a folder on your computer.
2. Open Google Chrome (or any Chromium-based browser such as Brave or Edge) and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner and select the extracted folder (containing `manifest.json`).
5. Pin **My Quality 4k** to your toolbar, open any 4K video on YouTube, and click the **Video Player** icon to monitor real-time multi-minute buffering.

### Option B: Clone from Source

```bash
git clone https://github.com/Alves404/My-Quality-4k.git
cd My-Quality-4k
npm run verify
```
Then load the cloned `My-Quality-4k` root folder via `chrome://extensions/` -> **Load unpacked**.

---

## 6. Running the Local Telemetry Services (Node.js & Ruby) — Optional for Developers

> [!NOTE]
> **Optional Developer Tooling (Zero End-User Impact):** The browser extension operates **100% standalone and autonomously** inside the browser. All core features—including 60s/120s/180s 4K pre-buffering, 512 MB SABR policy unlocking, hardware codec filtering (`VP9 SDR` / `AV1` blocker / `30fps` limiter), and MSE micro-gap stabilization—run natively in the extension without any external server.
>
> The Node.js and Ruby services below are **strictly optional diagnostic tools intended for developers** who wish to persist raw `googlevideo.com` network logs to disk and generate statistical CDN routing reports. **End users do not need to run or install these commands, and leaving them off has zero impact on video playback performance.**

If you are a developer and wish to persist network logs locally and generate statistical CDN route reports:

### 6.1. Verify Script Syntax Integrity
```bash
npm run verify
```

### 6.2. Start the Node.js Telemetry Ingestion Server
```bash
npm run telemetry:server
```
*(Then enable the local telemetry sync toggle inside the extension popup and click "Aplicar Agora").*

### 6.3. Run the Ruby Statistical Route & Cache Analyzer
```bash
npm run telemetry:analyze
```

---

## 7. Technical Report & Open Source Licensing

* **Engineering Technical Report:** Read [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md) for a complete breakdown of YouTube's SABR protocol, `g.vWa` byte-cap unlocking, hardware vs. software codec pipelines, and Open Source compliance.
* **License:** Distributed under the **GNU General Public License v3.0 (GPLv3)**, ensuring all derivatives remain free and Open Source. See [LICENSE](LICENSE) for full terms.

---

## 8. AI-Assisted Engineering Notice (Argon)

Prior to the main authorship credits, it is transparently recorded that the Open Source architecture of this project, the SABR and MSE buffer unlocking engine, the hardware codec interception hooks, the `googlevideo.com` Network Logs capture pipeline, the Node.js and Ruby telemetry services, and the technical documentation were developed with the direct AI-assisted engineering of **Argon (Google Antigravity)**, working in pair programming with the repository author.

---

## 9. Credits & Authorship

* **Creator, Lead Author & Maintainer:** Joao Vitor Magalhaes Alves (`@Alves`)
* **AI-Assisted Engineering & Co-Architecture:** Argon (Google Antigravity) & Claude Streaming Architect
* **Conceptual Open Source References:** Inspired by architectural best practices from community projects such as `enhanced-h264ify` (MIT) and `uBlock Origin` (GPLv3).
