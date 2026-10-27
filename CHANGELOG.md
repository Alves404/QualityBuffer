# Changelog

Todas as mudancas relevantes do projeto **My Quality 4k** serao documentadas neste arquivo.

O formato baseia-se em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e este projeto adere ao [Versionamento Semantico](https://semver.org/lang/pt-BR/).

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
