# Changelog

Todas as mudancas relevantes do projeto **My Quality 4k** serao documentadas neste arquivo.

O formato baseia-se em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e este projeto adere ao [Versionamento Semantico](https://semver.org/lang/pt-BR/).

---

## [2.0.0] - 2026-10-26

### Adicionado
- **Virtual Buffer Horizon (`TimeRanges` Clamping em `page-hook.js`):** Desbloqueia o limite nativo de ~15-20s do agendador DASH do YouTube em 4K, reportando um horizonte virtual de `7.5s` enquanto o buffer real ainda nao atingiu a meta configurada pelo usuario (`60s`, `120s` ou `180s` a frente) e mantendo o `TimeRanges` real intacto para telemetria e buscas (`seeking`).
- **Eviccao Proativa de Back-Buffer MSE & Protecao `QuotaExceededError`:** Recicla automaticamente os segmentos de video ja assistidos (`>22s` atras do ponteiro atual) para dedicar toda a janela de RAM do Chromium aos proximos minutos do video.
- **Motor de Pre-Fetch Paralelo em RAM (`sidx` Segment Index Parser):** Inspeciona o box `sidx` nos pacotes iniciais (`range=0-...`) e antecipa o download dos proximos byte-ranges em um cache LRU de 64 MB em memoria RAM.
- **Zero-Track-Laying Bootstrap:** Spoofing de `navigator.connection` (`100 Mbps / 5ms RTT`), pre-seeding de `localStorage` e `sessionStorage` (`yt-player-quality = 2160`) antes do segundo zero e correcao da race condition de `qualityAppliedForVideo`.
- **Headstart Buffer Boost & Bloqueio de Beacons Pesados:** Formacao de colchao inicial em 4K antes de liberar a reproducao e bloqueio de endpoints pesados na thread principal (`/youtubei/v1/log_event`, `/api/stats/qoe`, `/ptracking`), preservando `/api/stats/watchtime`.

---

## [1.0.0] - 2026-10-26

### Adicionado
- **Extensao Chrome Manifest V3 (`manifest.json`):** Arquitetura dual-world (`MAIN` e `ISOLATED`) pronta para carregamento direto no navegador.
- **Page Hook Engine (`src/content/page-hook.js`):**
  - Interceptacao de `MediaSource.isTypeSupported` e `HTMLMediaElement.prototype.canPlayType` para bloquear decodificacao pesada via software (`AV1` / `av01`, `VP9 Profile 2 HDR 10-bit` e limitador opcional de `60fps` para `30fps`), priorizando `VP9 Profile 0 SDR` acelerado por hardware em 4K (`2160p`).
  - Estabilizador de `SourceBuffer` com deteccao e correcao automatica de micro-gaps temporais entre segmentos MSE.
  - Controle de qualidade fixa (`hd2160`, `hd1440`, `hd1080`) integrado a API interna `#movie_player` do YouTube.
  - Protecao inteligente contra perda severa de quadros (`Smart Drop Guard`).
- **Otimizador de Composicao GPU (`src/content/player-optimize.css`):** Desativacao automatica do `#cinematic-container` (Ambient Mode) e isolamento de camada de hardware para `<video>`.
- **Monitor de Rede e Telemetria (`src/background/service-worker.js`):** Captura em tempo real de fragmentos `*.googlevideo.com/videoplayback*`, calculo de throughput (Mbps), latencia (ms) e mapeamento de `itag`.
- **Interface Popup (`src/popup/`):** Painel tecnico de controle, visualizador de Network Logs em tempo real e exportacao de relatorio JSON.
- **Servicos Back-end de Telemetria e Cache (`backend/`):**
  - Servidor HTTP em Node.js (`backend/node-server/server.js`) para ingestao de logs e calculo de heuristicas de rota.
  - Analisador estatistico em Ruby (`backend/ruby-analyzer/telemetry_analyzer.rb`) para emissao de relatorios de percentis de banda (P50/P95) e ranking de nos CDN.
- **Documentacao e Governanca Open Source:** `LICENSE` (GNU GPLv3), `docs/TECHNICAL_REPORT.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` e nota de engenharia assistida pelo **Argon (Google Antigravity)**.
