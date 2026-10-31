# Privacy Policy — My Quality 4k

**Last Updated:** October 30, 2026  
**Extension Name:** My Quality 4k  
**Version:** 2.1.0 (Manifest V3)  
**Author & Maintainer:** Joao Vitor Magalhaes Alves ([github.com/Alves404](https://github.com/Alves404))  
**Repository:** [https://github.com/Alves404/My-Quality-4k](https://github.com/Alves404/My-Quality-4k)

---

## 1. Zero Personal Data Collection

**My Quality 4k** does **not** collect, store, sell, rent, share, or transmit any personal data, personally identifiable information (PII), browsing history, user credentials, cookies, or analytics to any external server or third party.

All extension logic executes **100% locally** inside the user's web browser.

---

## 2. How Permissions Are Used Locally

To fulfill its single purpose—optimizing 4K YouTube video pre-buffering, stabilizing MediaSource Extensions (MSE) buffers, and enforcing hardware-accelerated video codecs (`VP9 SDR`)—the extension requests the minimum required Chrome Manifest V3 permissions:

1. **`storage` (`chrome.storage.local`):**
   Used strictly to save the user's local preferences on their own device (such as target resolution `2160p/1440p/1080p`, pre-buffer horizon `60s/120s/180s`, hardware codec toggles, and interface language `EN/PT/ES`). No configuration data ever leaves the user's browser.
2. **`activeTab` & `scripting`:**
   Used strictly when the user clicks the **Apply Now (`Aplicar Agora`)** button inside the extension popup to immediately apply updated quality, buffer, and codec settings to the currently active YouTube tab without requiring a full page reload.
3. **`webRequest` & Host Permissions (`*://*.youtube.com/*`, `*://*.googlevideo.com/*`):**
   - `*://*.youtube.com/*`: Required to run the player optimization content scripts on YouTube watch pages.
   - `*://*.googlevideo.com/*`: Used in a strictly passive, read-only manner (`chrome.webRequest.onBeforeRequest` / `onCompleted`) to calculate real-time media chunk throughput (Mbps) and CDN latency (ms) in volatile memory (RAM) for display in the extension's popup dashboard. Media payloads and user identifiers are never stored or transmitted externally.

---

## 3. Optional Developer Localhost Diagnostic Mode

The extension includes an **off-by-default** developer toggle (*Sync Local Telemetry*). When left in its default disabled state (`false`), no network requests are made outside YouTube's media playback pipeline. Even if manually enabled by a developer testing the repository locally, diagnostic metrics are sent exclusively to the developer's own loopback interface (`http://localhost:3456/api/telemetry`) and never to any external or remote host.

---

## 4. Open Source Transparency & Contact

**My Quality 4k** is 100% Open Source software licensed under the **GNU General Public License v3.0 (GPL-3.0)**. Every line of code can be audited publicly at:
* [https://github.com/Alves404/My-Quality-4k](https://github.com/Alves404/My-Quality-4k)

For questions regarding privacy or security, please open an issue on the official GitHub repository.
