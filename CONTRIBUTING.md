# Guia de Contribuicao — My Quality 4k

Obrigado pelo interesse em contribuir com o **My Quality 4k**. Este projeto e Open Source sob a licenca **GNU GPLv3 (GPL-3.0)** e busca otimizar a reproducao de videos 4K no YouTube para computadores de entrada e intermediarios.

---

## Como Contribuir

1. Realize um **Fork** deste repositorio.
2. Crie uma branch descritiva para sua funcionalidade ou correcao:
   ```bash
   git checkout -b feat/otimizacao-buffer-mse
   ```
3. Teste a extensao localmente no Google Chrome (`chrome://extensions` -> Modo do Desenvolvedor -> Carregar sem compactacao).
4. Execute a verificacao de sintaxe antes de enviar:
   ```bash
   npm run verify
   ```
5. Envie um **Pull Request** detalhando o comportamento antes e depois da alteracao, incluindo metricas de perda de quadros (`droppedVideoFrames`) e uso de CPU/GPU quando aplicavel.

---

## Padroes de Codigo e Diretrizes

* **Manifest V3:** Todo codigo da extensao deve ser compativel com o padrao Manifest V3 do Chromium.
* **Zero Dependencias Desnecessarias no Front-end:** O codigo injetado no YouTube (`src/content/page-hook.js` e `src/content/content-controller.js`) deve permanecer em JavaScript puro (Vanilla JS) de baixa latencia para nao adicionar sobrecarga de memoria RAM.
* **Sem Emojis:** Mantenha comentarios de codigo, commits, interfaces e documentacao estritamente tecnicos e livres de emojis.
* **Seguranca e Privacidade:** Nenhum dado de navegacao deve ser enviado para servidores externos. O servico de telemetria deve apontar exclusivamente para `localhost` quando ativado manualmente pelo usuario.
