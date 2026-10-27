# Engineering Technical Report & Open Source Compliance — My Quality 4k

**Project:** My Quality 4k  
**Version:** 2.1.0 (SABR 512 MB Policy Unlocker & Hardware Codec Engine)  
**Target Platform:** Google Chrome / Chromium (Manifest V3)  
**License:** GNU General Public License v3.0 (GPL-3.0 / Copyleft Open Source)  
**Repository:** `https://github.com/Alves404/My-Quality-4k`

---

## 1. Executive Summary

**My Quality 4k** is an Open Source browser extension paired with a lightweight local telemetry ecosystem (Node.js and Ruby). Its primary goal is to allow entry-level and mid-range computers—without flagship graphics cards—to play **4K (2160p)** YouTube videos smoothly and without rebuffering stalls by unlocking YouTube's internal SABR buffer limits (`60s`, `120s`, or `180s` ahead), stabilizing `MediaSource Extensions (MSE)` buffers, and enforcing hardware-accelerated video codecs.

---

## 2. Engineering Root-Cause Analysis: Why 4K Stalls on Modest PCs & Stops Buffering at 16 Seconds

On computers equipped with 4-core CPUs (e.g., Intel Core i3-10100F), 8 GB of RAM, and entry-level 4 GB VRAM GPUs (e.g., AMD Radeon RX 550 Series or integrated graphics), standard 4K YouTube playback suffers from four critical bottlenecks:

### 2.1. YouTube's Hardcoded 35 MB (16.3-Second) 4K Buffer Cap & Server-Driven ABR (SABR)
In modern YouTube (`base.js`), all adaptive streams are delivered via `serverAbrStreamingUrl` (`useServerDrivenAbr: true`). Two mechanisms cap 4K pre-buffering at ~16 seconds:
1. **Client-Side Byte Cap (`fPa` / `kO`):** When `b.video.qualityOrdinal > 1080`, `fPa` sets `a.policy.ya = 36700160` bytes (**35 MB**). When `kO(loader, videoTrack)` divides `36,700,160` by a 4K stream's byte rate (`~2,250,000` bytes/sec), it returns **16.3 seconds**. Furthermore, `KSa` sends this 35 MB budget in protobuf field #75 (`UF`) of `ClientAbrState` to `googlevideo.com`.
2. **Server-Side NextRequestPolicy (`Owa` / `JRa` / `RO`):** Google's `googlevideo.com` server returns UMP part #35 (`Owa`) with `targetVideoReadaheadMs: 15000` (15 seconds) and stops transmitting video slices once `(bufferedEndMs - mp) >= 16000 ms`.

**Implemented Solution (`src/content/page-hook.js`):**
- Hooks `Object.prototype.videoTrack` to capture YouTube's internal `policy` (`g.vWa`), `loader` (`AWa`), and SABR coordinator (`qkb`).
- Locks `policy.ya` to **512 MB** (`536,870,912` bytes), `policy.Ta` to **64 MB** (`67,108,864` bytes), and `policy.sb` / `policy.ha` to the user's configured `targetBufferSec` (`60s`, `120s`, or `180s`).
- Wraps the SABR coordinator prototype methods (`Mq` and `RO`) so `targetVideoReadaheadMs` and `targetAudioReadaheadMs` are boosted to `targetBufferSec * 1000`, `UF`/`TF` byte budgets report 512 MB / 64 MB, and the outgoing media position (`mp`) advances inside the active buffered range (`bc`) until the full multi-minute buffer target is reached.

### 2.2. Hardware Codec Incompatibility with AV1 (`av01`) and 10-bit HDR (`vp09.02`)
YouTube prioritizes **AV1** (`av01.*`, such as `itag=401`) for 4K delivery. GPUs released prior to RDNA 2 / RTX 3000 / Intel Arc lack a dedicated hardware AV1 decoder block, forcing software decoding (`dav1d`) on the CPU at 100% utilization and causing severe frame drops.

**Implemented Solution (`src/content/page-hook.js`):**
Intercepts `MediaSource.isTypeSupported()`, `HTMLMediaElement.prototype.canPlayType()`, and `navigator.mediaCapabilities.decodingInfo()` in the `MAIN` world at `document_start`. Rejects `av01`, `vp09.02` (10-bit HDR), and optionally `framerate > 30` (30fps Limiter), while certifying **VP9 Profile 0 (8-bit SDR)** as `{ supported: true, smooth: true, powerEfficient: true }`.

### 2.3. MSE SourceBuffer Micro-Gaps
Small timestamp discontinuities (e.g., `0.02s` gaps between segments) cause the HTML5 `<video>` element to enter a stalled waiting state (`readyState < 3`). The extension's monitor loop inspects `video.buffered` ranges and automatically advances `video.currentTime` across micro-gaps (`nextGapStart + 0.02s`).

### 2.4. Compositor & Telemetry Overhead
Neutralizes YouTube's GPU-heavy Ambient Mode (`#cinematic-container`), promotes `<video class="html5-main-video">` to an isolated hardware compositor layer, and short-circuits main-thread telemetry beacons (`/youtubei/v1/log_event`, `/api/stats/qoe`, `/ptracking`) while preserving `/api/stats/watchtime`.

---

## 3. Network Monitoring & Telemetry Services (Node.js & Ruby — Optional for Developers)

> **Note:** The local Node.js and Ruby telemetry services are **strictly optional developer tools** for offline CDN route analysis and have **zero impact on the end-user experience**. The browser extension performs all 4K SABR pre-buffering, MSE stabilization, and hardware codec enforcement 100% standalone.

1. **Passive Browser Capture (`src/background/service-worker.js`):**
   Uses `chrome.webRequest` filtered to `*://*.googlevideo.com/videoplayback*` (including `responseHeaders` `Content-Length` inspection for SABR chunks) to compute real-time throughput in **Mbps**, latency in **ms**, and `itag` format distribution.
2. **Local Analysis Backend (`backend/`):**
   - **Node.js Server (`backend/node-server/server.js`):** Receives telemetry payloads at `http://localhost:3456/api/telemetry` and computes adaptive cache heuristics per CDN host.
   - **Ruby Statistical Analyzer (`backend/ruby-analyzer/telemetry_analyzer.rb`):** Processes `backend/data/network_logs.json` to calculate P50 and P95 throughput/latency percentiles and outputs `backend/data/route_optimization_report.json`.

---

## 4. Open Source Compliance Matrix

| Component / File | Applicable License | Compliance Notes |
| :--- | :--- | :--- |
| Extension Source Code (`src/*`, `manifest.json`) | **GNU GPLv3 (GPL-3.0)** | Copyleft Open Source: derivatives must remain open under the same license. |
| Telemetry Server (`backend/node-server/*`) | **GNU GPLv3 (GPL-3.0)** | Uses only native Node.js modules (`http`, `fs`, `path`), zero proprietary dependencies. |
| Route Analyzer (`backend/ruby-analyzer/*`) | **GNU GPLv3 (GPL-3.0)** | Uses only the Ruby standard library (`json`, `time`, `fileutils`). |
| Documentation (`README.md`, `docs/*`) | **GNU GPLv3 / CC-BY-SA 4.0** | Open, auditable technical documentation. |

---

## 5. AI-Assisted Engineering Notice (Argon)

Prior to formal authorship credits, it is transparently declared for technical and Open Source compliance that the SABR 512 MB policy unlocking architecture, the `MediaSource` codec interception hooks, the MSE micro-gap recovery logic, the `googlevideo.com` packet telemetry pipeline, the Node.js/Ruby backend services, and the technical documentation of this repository were designed and implemented with the direct assistance of **Argon (Google Antigravity)**, working in pair programming with the project author.

---

## 6. Credits

* **Creator, Lead Author & Maintainer:** Joao Vitor Magalhaes Alves (`@Alves`)
* **AI-Assisted Engineering & Co-Architecture:** Argon (Google Antigravity) & Claude Streaming Architect
