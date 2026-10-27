# Relatorio Tecnico de Engenharia e Conformidade Open Source — My Quality 4k

**Projeto:** My Quality 4k  
**Versao:** 2.0.0 (Deep Pre-Buffer & Zero-Track-Laying Engine)  
**Plataforma Alvo Inicial:** Google Chrome / Chromium (Manifest V3)  
**Licenca:** GNU General Public License v3.0 (GPL-3.0 / Copyleft Open Source)  
**Repositorio:** `https://github.com/Alves404/My-Quality-4k`

---

## 1. Resumo Executivo

O projeto **My Quality 4k** e uma extensao de navegador Open Source acompanhada de um ecossistema leve de telemetria local (Node.js e Ruby). Seu proposito fundamental e permitir que computadores de entrada ou intermediarios — que nao possuem placas de video de ultima geracao — consigam reproduzir videos em **4K (2160p)** no YouTube de forma estavel e sem travamentos, aproveitando conexoes de internet estaveis por meio da otimizacao do pipeline de buffers (`MediaSource Extensions` - MSE) e da selecao inteligente de codecs acelerados por hardware.

---

## 2. Analise de Engenharia: Por que Videos 4K Travam em PCs Modestos?

Em testes realizados em maquinas com configuracoes equivalentes a processadores de 4 nucleos (ex: Intel Core i3-10100F), 8 GB de RAM e placas de video de entrada com 4 GB de VRAM (ex: AMD Radeon RX 550 Series ou GPUs integradas), a reproducao padrao de videos 4K no YouTube sofre com tres problemas criticos que **nao dependem da velocidade da internet**:

### 2.1. Incompatibilidade de Decodificacao de Hardware com o Codec AV1
Por padrao, o servidor do YouTube prioriza a entrega de streams 4K codificados em **AV1** (`av01.*`, como `itag=401`) para economizar largura de banda de CDN. Contudo, placas de video lancadas antes das arquiteturas RDNA 2 / RTX 3000 / Intel Arc nao possuem circuito dedicado (ASIC) para decodificacao de hardware AV1. Quando o navegador recebe `av01` em 2160p, toda a carga recai sobre o decodificador por software (`dav1d`) na CPU, elevando o uso do processador a 100% e causando perda severa de quadros (`droppedVideoFrames`).

**Solucao Implementada (`src/content/page-hook.js`):**
A extensao intercepta as chamadas nativas `MediaSource.isTypeSupported()` e `HTMLMediaElement.prototype.canPlayType()` no contexto principal (`MAIN world`) antes do carregamento do player do YouTube. Ao recusar os identificadores `av01` e perfis `vp09.02` (HDR 10-bit que exige alto processamento de shaders de tonemapping), o YouTube passa automaticamente a fornecer o stream **VP9 Profile 0 (8-bit SDR)** (`itag=313` para 4K 30fps ou `itag=315` para 4K 60fps), cuja decodificacao hibrida/hardware reduz drasticamente a carga sobre a CPU. Adicionalmente, o painel inclui a chave opcional **Limitar Streams a 30fps (Bloquear 60fps)** (`framerate>30`), reduzindo pela metade os quadros decodificados por segundo em videos de gameplay para aliviar GPUs de 4 GB VRAM (como a Radeon RX 550).

### 2.2. Micro-Gaps no SourceBuffer e Descarte Prematuro de Cache (ABR)
O player HTML5 do YouTube utiliza `MediaSource Extensions (MSE)` para anexar fragmentos binarios (`appendBuffer`) provenientes dos servidores `*.googlevideo.com`. Em computadores com memoria RAM limitada (8 GB), pequenas latencias de escalonamento de thread geram micro-lacunas temporais (ex: um intervalo vazio de `0.02s` entre o fim do segmento `N` e o inicio do segmento `N+1`). O player interpreta essa micro-lacuna como falta de buffer (`readyState < 3`) e trava indefinidamente com o indicador de carregamento, mesmo tendo dezenas de megabytes ja baixados a frente.

**Solucao Implementada (`src/content/page-hook.js`):**
1. **Monitoramento de `SourceBuffer`:** Hook direto em `MediaSource.prototype.addSourceBuffer` para contabilizar o volume real de bytes anexados na fila de video.
2. **Auto-Recuperacao de Micro-Gaps:** Um ciclo de verificacao inspeciona os intervalos de `video.buffered`. Caso o video entre em estado de espera (`readyState < 3`) e exista um bloco ja carregado a menos de `0.85s` de distancia, o ponteiro `video.currentTime` avanca automaticamente para o inicio do proximo segmento valido (`nextGapStart + 0.02s`), eliminando congelamentos.
3. **Trava de Heuristica de Qualidade (`setPlaybackQualityRange`) e Zero-Track-Laying Bootstrap (v2.0):** Pre-configura `yt-player-quality = 2160` no `localStorage`/`sessionStorage`, informa `100 Mbps / 5ms RTT` em `navigator.connection` e trava a resolucao 4K desde o segundo zero, impedindo que o algoritmo ABR inicie em baixa qualidade e troque de faixa com o video em movimento.
4. **Virtual Buffer Horizon (`TimeRanges` Clamping) & Eviccao de Back-Buffer (v2.0):** O agendador nativo do YouTube interrompe o download de chunks quando detecta ~15-20s de buffer em 4K. O motor v2.0 intercepta `HTMLMediaElement.prototype.buffered` e `SourceBuffer.prototype.buffered`, reportando um horizonte virtual de `7.5s` ao agendador do YouTube enquanto o buffer real nao atinge a meta de `60s`, `120s` ou `180s` (os proximos minutos do video). Simultaneamente, remove proativamente segmentos ja assistidos (`>22s` atras de `currentTime`) para evitar `QuotaExceededError` na memoria MSE do Chromium.
5. **Pre-Fetch Paralelo em RAM via Indice `sidx` e Bloqueio de Beacons (v2.0):** Extrai a tabela de byte-ranges do box `sidx` na inicializacao da stream, pre-carrega segmentos futuros em cache LRU de 64 MB na RAM e bloqueia endpoints pesados de telemetria interna do YouTube (`/youtubei/v1/log_event`, `/api/stats/qoe`, `/ptracking`) para aliviar CPUs de 4 nucleos.

### 2.3. Sobrecarga de Composicao Grafica (YouTube Ambient Mode)
O recurso "Modo Ambiente" (`#cinematic-container`) do YouTube renderiza um elemento `<canvas>` secundário que amostra e desfoca o video principal em tempo real. Em placas de video com largura de banda de memoria restrita (4 GB GDDR5), esse efeito consome ate 30% do orcamento de tempo de quadro.

**Solucao Implementada (`src/content/player-optimize.css`):**
Desativacao automatica do `#cinematic-container` e isolamento do elemento `<video class="html5-main-video">` em uma camada de hardware dedicada (`transform: translateZ(0); backface-visibility: hidden;`).

---

## 3. Monitoramento de Rede e Servicos de Telemetria (Node.js & Ruby)

Para atender ao requisito de estabilizacao de buffer guiada por **Network Logs**, o sistema opera em duas camadas:

1. **Coleta Passiva no Navegador (`src/background/service-worker.js`):**
   Utiliza a API `chrome.webRequest` filtrada para `*://*.googlevideo.com/videoplayback*`. Para cada fragmento de video, extrai:
   - `itag`: Identificador do formato/codec do stream.
   - `range`: Intervalo exato de bytes transferidos no pacote.
   - `rn` e `rbuf`: Numero sequencial da requisicao e estado do buffer reportado ao CDN.
   - Taxa de transferencia efetiva em **Mbps** e latencia de entrega do chunk em **milissegundos (ms)**.

2. **Servicos Locais de Analise (`backend/`):**
   - **Servidor Node.js (`backend/node-server/server.js`):** Recebe os lotes de telemetria em `http://localhost:3456/api/telemetry`, consolida estatisticas por servidor CDN (`r*---sn-*.googlevideo.com`) e calcula heuristicas adaptativas de qualidade e limiar de recuperacao de gaps.
   - **Analisador Estatistico Ruby (`backend/ruby-analyzer/telemetry_analyzer.rb`):** Processa o historico persistido em `backend/data/network_logs.json`, calculando percentis P50 e P95 de banda e latencia e gerando um relatorio estruturado em `backend/data/route_optimization_report.json`.

---

## 4. Conformidade e Licenciamento Open Source

Este repositorio segue rigorosamente as melhores praticas de projetos Open Source de referencia (inspirado na organizacao estrutural de projetos como `enhanced-h264ify` e `uBlock Origin`):

| Componente / Arquivo | Licenca Aplicavel | Observacoes de Conformidade |
| :--- | :--- | :--- |
| Codigo-fonte da Extensao (`src/*`, `manifest.json`) | **GNU GPLv3 (GPL-3.0)** | Copyleft Open Source: derivados devem manter o codigo aberto sob a mesma licenca. |
| Servidor de Telemetria (`backend/node-server/*`) | **GNU GPLv3 (GPL-3.0)** | Utiliza exclusivamente modulos nativos do Node.js (`http`, `fs`, `path`), sem dependencias proprietarias. |
| Analisador de Rotas (`backend/ruby-analyzer/*`) | **GNU GPLv3 (GPL-3.0)** | Utiliza exclusivamente a biblioteca padrao do Ruby (`json`, `time`, `fileutils`). |
| Documentacao (`README.md`, `docs/*`) | **GNU GPLv3 / CC-BY-SA 4.0** | Documentacao aberta e auditavel. |

---

## 5. Nota de Engenharia Assistida por IA (Argon)

Antes da atribuicao dos creditos formais, declara-se para fins de transparencia tecnica e conformidade Open Source que a arquitetura de interceptacao de codecs via `MediaSource`, a logica de estabilizacao e recuperacao de micro-gaps de buffer, o monitoramento de pacotes `googlevideo.com`, os servicos de telemetria em Node.js/Ruby e a documentacao tecnica deste repositorio foram projetados e implementados com a assistencia direta do **Argon (Google Antigravity)**, atuando em programacao em par com o autor do projeto.

---

## 6. Creditos

* **Autor, Idealizador e Mantenedor:** Joao Vitor Magalhaes Alves (`@Alves`)
* **Engenharia Assistida por IA e Co-Arquitetura:** Argon (Google Antigravity)
