# Contributing Guide — My Quality 4k

Thank you for your interest in contributing to **My Quality 4k**. This project is Open Source under the **GNU GPLv3 (GPL-3.0)** license and focuses on optimizing 4K YouTube video playback, SABR/MSE buffer depth, and hardware codec selection for entry-level and mid-range PCs.

---

## How to Contribute

1. **Fork** this repository.
2. Create a descriptive feature or bugfix branch:
   ```bash
   git checkout -b feat/sabr-buffer-optimization
   ```
3. Test the extension locally in Google Chrome (`chrome://extensions` -> Developer mode -> Load unpacked).
4. Run the syntax verification script before submitting:
   ```bash
   npm run verify
   ```
5. Open a **Pull Request** detailing the behavior before and after your change, including frame drop metrics (`droppedVideoFrames`), buffer horizon seconds (`bufferAheadSec`), and CPU/GPU usage where applicable.

---

## Code Standards & Guidelines

* **Manifest V3:** All browser extension code must strictly comply with Chromium Manifest V3 standards.
* **Zero External Front-End Dependencies:** Code injected into YouTube (`src/content/page-hook.js` and `src/content/content-controller.js`) must remain pure, low-latency Vanilla JavaScript with zero external dependencies.
* **No Emojis:** Keep all code comments, commit messages, UI strings, and documentation strictly technical and free of emojis.
* **Privacy & Security:** No browsing data may ever be transmitted to external third-party servers. Telemetry synchronization must remain strictly opt-in and target `localhost` only.
