# Guia de Publicação na Chrome Web Store — My Quality 4k (v2.2.0)

Este documento contém todas as informações, descrições e justificativas técnicas prontas para submissão no [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## 1. Pacote para Envio

Para gerar o pacote limpo e validado de produção a qualquer momento:
```bash
npm run build:cws
```
O script gera a pasta de testes descompactada e o arquivo `.zip` otimizado em `chrome-web-store/` (ignorado pelo Git para evitar duplicações no repositório).

---

## 2. Respostas Prontas para a Aba "Privacidade" (Privacy Practices) da Chrome Web Store

Quando estiver preenchendo o painel da Chrome Web Store, copie e cole os textos abaixo nos campos solicitados pelos revisores do Google:

### Single Purpose Description (Descrição de Propósito Único)
> My Quality 4k optimizes HTML5 video playback and media streaming: it unlocks multi-minute 4K (2160p) pre-buffering (60s, 120s, or 180s), stabilizes MediaSource Extensions (MSE) buffers, enforces hardware-accelerated VP9 SDR decoding on YouTube, and allows users to detect and save standard HLS (M3U8) and MP4/WebM video streams on non-YouTube web pages.

### Permission Justifications (Justificativa de Permissões)

* **`storage` Justification:**
  > Used exclusively to store the user's local extension settings (target video resolution, pre-buffer duration of 60s/120s/180s, hardware codec filters, and UI language EN/PT/ES) locally in `chrome.storage.local`.

* **`activeTab` Justification:**
  > Used when the user opens the popup UI to display detected video streams for the active tab and when clicking "Apply Now" to immediately communicate updated playback and codec preferences to the active tab without requiring a page reload.

* **`scripting` Justification:**
  > Used to ensure the player optimization scripts (`page-hook.js` and `content-controller.js`) are active on an already-open tab when the user clicks "Apply Now" right after installing or updating the extension.

* **`downloads` Justification:**
  > Used exclusively when the user clicks the "Download Video" button in the popup's Downloader tab to save a detected direct video stream (.mp4 or .webm) to their local device.

* **`webRequest` Justification:**
  > Used passively (read-only) in volatile memory to measure real-time video chunk throughput (Mbps) and CDN latency (ms) for the live status dashboard, and to detect standard .m3u8 (HLS), .mp4, and .webm media URLs on non-YouTube web pages for the Downloader tab.

* **Host Permission (`<all_urls>`) Justification:**
  > Required to detect HTML5 `<video>` elements and HLS (.m3u8) / MP4 / WebM streams across arbitrary web pages and learning platforms when the user uses the built-in Video Downloader tab, as well as to optimize 4K SABR buffering and hardware VP9 codec selection on `*.youtube.com` and `*.googlevideo.com`.

### Remote Code (Uso de Código Remoto)
* **Marque:** `No, I am not using Remote code` (Não, todo o código JavaScript é executado localmente no pacote da extensão).

### Data Usage Disclosures (Coleta de Dados)
* **Marque:** Nenhuma caixa de coleta de dados (a extensão opera 100% localmente, sem servidores de telemetria e sem coleta de dados pessoais ou histórico).
* **Certifique as 3 caixas obrigatórias** de conformidade com a Política de Dados do Usuário da Chrome Web Store.
* **Privacy Policy URL (URL da Política de Privacidade):**  
  `https://github.com/Alves404/My-Quality-4k/blob/master/PRIVACY_POLICY.md`
