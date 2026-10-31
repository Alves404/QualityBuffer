# Guia de Publicacao na Chrome Web Store — My Quality 4k

Este diretorio (`chrome-web-store/`) contem a versao limpa, validada e pronta para envio imediato ao [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## 1. Arquivos Prontos para Upload

* **Pacote `.zip` para Upload na Chrome Web Store:**  
  `chrome-web-store/My-Quality-4k-ChromeWebStore-v2.1.0.zip`
* **Pasta Descompactada de Producao (para conferencia ou teste em `chrome://extensions`):**  
  `chrome-web-store/My-Quality-4k-CWS/`

> **Como regenerar a qualquer momento:** Execute `npm run build:cws` na raiz do projeto.

---

## 2. Respostas Prontas para a Aba "Privacidade" (Privacy Practices) da Chrome Web Store

Quando estiver preenchendo o painel da Chrome Web Store, copie e cole os textos abaixo nos campos solicitados pelos revisores do Google:

### Single Purpose Description (Descricao de Proposito Unico)
> My Quality 4k has a single purpose: optimizing YouTube HTML5 video playback by unlocking multi-minute 4K (2160p) pre-buffering (60s, 120s, or 180s), stabilizing MediaSource Extensions (MSE) buffers against micro-gaps, and enforcing hardware-accelerated video codecs (VP9 SDR instead of software-decoded AV1/HDR) on low-to-mid-range computers.

### Permission Justifications (Justificativa de Permissoes)

* **`storage` Justification:**
  > Used exclusively to store the user's local extension settings (target video resolution, pre-buffer duration of 60s/120s/180s, hardware codec filters, and UI language EN/PT/ES) locally in `chrome.storage.local`.

* **`activeTab` Justification:**
  > Used when the user clicks the "Apply Now" button in the popup UI to immediately communicate updated playback and codec preferences to the active YouTube tab without requiring a page reload.

* **`scripting` Justification:**
  > Used to ensure the YouTube player optimization scripts (`page-hook.js` and `content-controller.js`) are active on an already-open YouTube tab when the user clicks "Apply Now" right after installing or updating the extension.

* **`webRequest` Justification:**
  > Used passively (read-only) on `*://*.googlevideo.com/videoplayback*` media segment responses to measure real-time download throughput (Mbps) and CDN latency (ms) for the live status dashboard in the extension popup.

* **Host Permission (`*://*.youtube.com/*` and `*://*.googlevideo.com/*`) Justification:**
  > `*://*.youtube.com/*` is required to configure the YouTube HTML5 video player's quality, MSE buffer horizon, and `MediaSource` hardware codec support at `document_start`. `*://*.googlevideo.com/*` is required to measure real-time video chunk throughput (Mbps) and CDN latency (ms) and preconnect to active media CDN origins.

### Remote Code (Uso de Codigo Remoto)
* **Marque:** `No, I am not using Remote code` (Nao, todo o codigo JavaScript e executado localmente no pacote da extensao).

### Data Usage Disclosures (Coleta de Dados)
* **Marque:** Nenhuma caixa de coleta de dados (a extensao nao coleta dados pessoais, historico ou telemetria externa).
* **Certifique as 3 caixas obrigatorias** de conformidade com a Politica de Dados do Usuario da Chrome Web Store.
* **Privacy Policy URL (URL da Politica de Privacidade):**  
  `https://github.com/Alves404/My-Quality-4k/blob/master/PRIVACY_POLICY.md`
