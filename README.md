# My Quality 4k

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-red.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-blue.svg)](manifest.json)
[![Stack: JavaScript](https://img.shields.io/badge/Front--End-Vanilla_JS-yellow.svg)](src/)
[![Stack: Node.js & Ruby](https://img.shields.io/badge/Back--End-Node.js_%7C_Ruby-green.svg)](backend/)

Extensao Open Source para navegadores focada na otimizacao de videos em **4K (2160p)** do YouTube para computadores de entrada e intermediarios.

Seu principal objetivo e evitar travamentos e perdas de quadros (`dropped frames`) por meio da selecao inteligente de codecs acelerados por hardware, estabilizacao de buffers **MediaSource Extensions (MSE)** e monitoramento de pacotes via **Network Logs** (`googlevideo.com`). Permite a visualizacao fluida de videos pesados em 4K mesmo sem um computador de ponta, desde que o usuario possua uma conexao de internet estavel.

---

## Sumario

1. [O Problema e a Solucao de Engenharia](#1-o-problema-e-a-solucao-de-engenharia)
2. [Funcionalidades Implementadas](#2-funcionalidades-implementadas)
3. [Stack Tecnologica](#3-stack-tecnologica)
4. [Estrutura do Repositorio](#4-estrutura-do-repositorio)
5. [Como Instalar e Testar no Google Chrome](#5-como-instalar-e-testar-no-google-chrome)
6. [Executando os Servicos de Telemetria (Node.js e Ruby)](#6-executando-os-servicos-de-telemetria-nodejs-e-ruby)
7. [Relatorio Tecnico e Licenciamento Open Source](#7-relatorio-tecnico-e-licenciamento-open-source)
8. [Nota de Desenvolvimento Assistido por IA (Argon)](#8-nota-de-desenvolvimento-assistido-por-ia-argon)
9. [Creditos e Autoria](#9-creditos-e-autoria)

---

## 1. O Problema e a Solucao de Engenharia

Muitos computadores com processadores de 4 nucleos (ex: Intel Core i3) e placas de video de entrada com 4 GB de VRAM (ex: AMD Radeon RX 550 ou GPUs integradas) possuem velocidade de internet suficiente para baixar streams 4K (25 a 45 Mbps), mas sofrem travamentos severos no YouTube devido a tres fatores:

1. **Decodificacao AV1 via Software na CPU:** O YouTube entrega streams 4K prioritariamente no codec `AV1` (`av01`). GPUs sem decodificador fisico AV1 delegam todo o trabalho para o processador, levando o uso de CPU a 100%. O **My Quality 4k** intercepta o `MediaSource.isTypeSupported` e forca o YouTube a enviar **VP9 Profile 0 (8-bit SDR)** (`itag=313` / `itag=315`), transferindo a decodificacao para o hardware da placa de video.
2. **Micro-Gaps no SourceBuffer e Descarte de Cache:** Pequenas descontinuidades de milissegundos entre segmentos no buffer MSE congelam o player mesmo com dezenas de megabytes ja carregados na memoria. O motor da extensao monitora os intervalos de `video.buffered` e salta automaticamente sobre micro-lacunas, mantendo o fluxo continuo.
3. **Sobrecarga de Shaders em Segundo Plano:** O "Modo Ambiente" (`#cinematic-container`) do YouTube renderiza um canvas desfocado em tempo real que consome ate 30% de GPUs de entrada. A extensao neutraliza esse canvas e promove o elemento `<video>` para uma camada de composicao dedicada.

---

## 2. Funcionalidades Implementadas

* **Deep Pre-Buffer (Virtual Buffer Horizon - v2.0):** Desbloqueia o limite interno de ~15s do agendador DASH do YouTube ao gerenciar dinamicamente `HTMLMediaElement.prototype.buffered` e `SourceBuffer.prototype.buffered`, forcando o pre-carregamento continuo dos **proximos 1, 2 ou 3 minutos** de video em 4K enquanto recicla o back-buffer ja assistido para evitar `QuotaExceededError`.
* **Pre-Fetch Paralelo em RAM (Parser `sidx` 64 MB - v2.0):** Le o indice de segmentos (`sidx`) no pacote inicial (`range=0-...`) e antecipa o download dos proximos byte-ranges em cache RAM antes de o player requisita-los.
* **Zero-Track-Laying Bootstrap & Headstart Boost (v2.0):** Informa `100 Mbps / 5ms RTT` via `navigator.connection`, pre-configura `yt-player-quality = 2160` no `localStorage`/`sessionStorage` antes do segundo zero e forma um colchao inicial de 4K antes de liberar a reproducao.
* **Modificacao da Heuristica de Codec e Cache:** Bloqueio seletivo de `av01` (AV1), `vp09.02` (HDR 10-bit) e limitador opcional de **30fps (bloqueio de 60fps)** no `MAIN world` para garantir reproducao 4K via hardware em `VP9 Profile 0` sem engasgar GPUs de entrada.
* **Estabilizacao de Buffer MSE e Recuperacao de Micro-Gaps:** Monitoramento de chamadas `SourceBuffer.prototype.appendBuffer` e recuperacao automatica de travamentos em fronteiras de segmento.
* **Trava Inteligente de Resolucao 4K (`hd2160`):** Fixa a faixa de qualidade na API `#movie_player` do YouTube para impedir que o algoritmo adaptativo (ABR) descarte o buffer 4K ja baixado, contando com **Smart Drop Guard** caso a taxa de perda de quadros ultrapasse 18%.
* **Interceptacao e Diagnostico via Network Logs:** Monitoramento passivo via `chrome.webRequest` das requisicoes `*://*.googlevideo.com/videoplayback*`, calculando banda efetiva (Mbps), latencia (ms), tamanho de chunk e formato `itag`.
* **Interface Popup Tecnica:** Painel em tempo real com indicadores de saude do buffer, seletor de qualidade alvo, chaves de otimizacao de hardware e exportacao de logs em JSON.
* **Back-end Local de Telemetria e Rota:** Servidor Node.js e analisador estatistico em Ruby para consolidacao de metricas de CDN e recomendacao de heuristicas de cache.

---

## 3. Stack Tecnologica

* **Front-end (Extensao de Navegador):**
  * JavaScript ES6+ (Vanilla JS de baixa latencia e zero dependencias externas)
  * Chrome Extension Manifest V3 (`MAIN` e `ISOLATED` Content Scripts + Background Service Worker)
  * HTML5 & CSS3 (Camada de aceleracao de compositor e interface Popup)
* **Back-end (Servicos Locais de Telemetria e Caching):**
  * **JavaScript (Node.js):** Servidor HTTP nativo (`backend/node-server/server.js`) na porta `3456` para ingestao de Network Logs e calculo de heuristica adaptativa.
  * **Ruby:** Analisador estatistico (`backend/ruby-analyzer/telemetry_analyzer.rb`) para calculo de percentis P50/P95 de largura de banda, latencia e ranking de estabilidade de servidores CDN.

---

## 4. Estrutura do Repositorio

```text
My-Quality-4k/
├── manifest.json                 # Configuracao Chrome Extension Manifest V3
├── package.json                  # Scripts de verificacao e execucao do Back-end
├── LICENSE                       # Licenca Open Source GNU GPLv3 (Copyleft)
├── README.md                     # Documentacao principal do projeto
├── CONTRIBUTING.md               # Diretrizes para contribuidores Open Source
├── CODE_OF_CONDUCT.md            # Codigo de conduta (Contributor Covenant)
├── CHANGELOG.md                  # Historico de alteracoes e versoes
├── assets/
│   └── icons/                    # Icones da extensao (16px, 32px, 48px, 128px)
├── src/
│   ├── background/
│   │   └── service-worker.js     # Monitoramento de chunks googlevideo.com e métricas de rede
│   ├── content/
│   │   ├── page-hook.js          # Hook MAIN world: MSE, Codecs (VP9/AV1), Buffer e Player API
│   │   ├── content-controller.js # Ponte ISOLATED world com chrome.storage e runtime
│   │   └── player-optimize.css   # Isolamento de camada GPU e remocao do Ambient Mode
│   └── popup/
│       ├── popup.html            # Estrutura da interface de controle e Network Logs
│       ├── popup.css             # Estilizacao tecnica em modo escuro
│       └── popup.js              # Controlador de estado e exportacao de relatorios JSON
├── backend/
│   ├── data/                     # Diretorio de persistencia de logs e relatorios
│   ├── node-server/
│   │   └── server.js             # Servidor HTTP Node.js para ingestao de telemetria
│   └── ruby-analyzer/
│       └── telemetry_analyzer.rb # Analisador Ruby para diagnostico de rota e cache
└── docs/
    └── TECHNICAL_REPORT.md       # Relatorio Tecnico de Engenharia e Licenciamento
```

---

## 5. Como Instalar e Testar no Google Chrome

O repositorio foi estruturado com o `manifest.json` diretamente na raiz para facilitar o carregamento imediato no navegador:

1. Abra o Google Chrome e digite na barra de enderecos:
   ```text
   chrome://extensions/
   ```
2. No canto superior direito, ative a chave **Modo do desenvolvedor** (*Developer mode*).
3. Clique no botao **Carregar sem compactacao** (*Load unpacked*) no canto superior esquerdo.
4. Selecione a pasta raiz deste repositorio:
   ```text
   C:\Users\joao\Documents\GitHub\My-Quality-4k
   ```
5. Fixe a extensao **My Quality 4k** na barra de ferramentas do Chrome, abra qualquer video em 4K no YouTube e clique no icone **4K** para visualizar o buffer, o codec ativo e os logs de rede em tempo real.

---

## 6. Executando os Servicos de Telemetria (Node.js e Ruby)

A extensao funciona de maneira **100% autonoma** no navegador. Caso deseje utilizar o servidor local para persistir os logs de rede e gerar relatorios estatisticos de rota:

### 6.1. Verificar a Integridade dos Scripts
```bash
npm run verify
```

### 6.2. Iniciar o Servidor de Telemetria em Node.js
```bash
npm run telemetry:server
```
*(Em seguida, ative a opcao "Sincronizar Telemetria Local" no Popup da extensao).*

### 6.3. Executar o Analisador de Rotas e Cache em Ruby
```bash
npm run telemetry:analyze
```

---

## 7. Relatorio Tecnico e Licenciamento Open Source

* **Relatorio Tecnico Completo:** Consulte [docs/TECHNICAL_REPORT.md](docs/TECHNICAL_REPORT.md) para uma analise aprofundada sobre decodificacao de hardware vs. software, comportamento do `SourceBuffer` no Chromium, anatomia das requisicoes `googlevideo.com` e matriz de conformidade Open Source.
* **Licenca:** Distribuido sob a **GNU General Public License v3.0 (GPLv3)** — garantindo que qualquer derivado deste codigo tambem permaneca Open Source. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 8. Nota de Desenvolvimento Assistido por IA (Argon)

Antes dos creditos principais, registra-se com total transparencia que a arquitetura deste projeto Open Source, a engenharia de interceptacao de codecs e buffers MSE, o sistema de captura de Network Logs, os servicos de telemetria em Node.js e Ruby e a documentacao tecnica foram desenvolvidos com a ajuda assistida do **Argon (Google Antigravity)**, atuando em programacao assistida junto ao autor do repositorio.

---

## 9. Creditos e Autoria

* **Idealizador, Autor Principal e Mantenedor:** Joao Vitor Magalhaes Alves (`@Alves`)
* **Engenharia Assistida e Co-Arquitetura:** Argon (Google Antigravity)
* **Referencias Conceituais da Comunidade Open Source:** Arquitetura inspirada nas boas praticas de projetos abertos como `enhanced-h264ify` (MIT) e `uBlock Origin` (GPLv3).
