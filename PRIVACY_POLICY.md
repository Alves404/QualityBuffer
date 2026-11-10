# Privacy Policy — QualityBuffer

**Last Updated:** November 9, 2026  
**Extension Name:** QualityBuffer  
**Version:** 2.2.1 (Manifest V3)  
**Author & Maintainer:** Joao Vitor Magalhaes Alves ([github.com/Alves404](https://github.com/Alves404))  
**Repository:** [https://github.com/Alves404/QualityBuffer](https://github.com/Alves404/QualityBuffer)

---

## 1. Zero Personal Data Collection & Zero Telemetry

**QualityBuffer** does **not** collect, store, sell, rent, share, or transmit any personal data, personally identifiable information (PII), browsing history, user credentials, cookies, or telemetry to any external or local server.

All extension logic executes **100% locally and standalone** inside the user's web browser.

---

## 2. How Permissions Are Used Locally

To fulfill its purpose—optimizing 4K YouTube video pre-buffering, enforcing hardware-accelerated video codecs (`VP9 SDR`), and enabling local downloads of standard web video streams (`HLS M3U8` / `MP4` / `WebM`)—the extension requests the minimum required Chrome Manifest V3 permissions:

1. **`storage` (`chrome.storage.local`):**
   Used strictly to save the user's local preferences on their own device (target resolution `2160p/1440p/1080p`, pre-buffer horizon `60s/120s/180s`, hardware codec toggles, and interface language `EN/PT/ES`). No configuration data ever leaves the user's browser.
2. **`activeTab` & `scripting`:**
   Used strictly when the user interacts with the extension popup to apply updated playback settings or initiate a user-requested video stream download on the currently active tab.
3. **`downloads`:**
   Used exclusively when the user explicitly clicks the **Download Video** button in the popup UI to save a detected direct video file (`.mp4` / `.webm`) to their own computer.
4. **`webRequest` & Host Permissions (`<all_urls>`):**
   Used passively (read-only) in volatile memory (RAM) to:
   - Measure real-time media chunk throughput (Mbps) and CDN latency (ms) on YouTube watch pages for display in the popup dashboard.
   - Detect playable `.m3u8` (HLS) and `.mp4`/`.webm` video streams on web pages so the user can download them from the `Downloader` tab (excluding YouTube/GoogleVideo internal streams in full compliance with Chrome Web Store policies).

---

## 3. Open Source Transparency & Contact

**QualityBuffer** is 100% Open Source software licensed under the **GNU General Public License v3.0 (GPL-3.0)**. Every line of code can be audited publicly at:
* [https://github.com/Alves404/QualityBuffer](https://github.com/Alves404/QualityBuffer)

For questions regarding privacy or security, please open an issue on the official GitHub repository.
