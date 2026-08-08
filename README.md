# My Quality 4k

Extensão Open Source para navegadores focada na otimização de vídeos em 4k do YouTube. 
Seu principal objetivo é evitar travamentos por meio da interceptação de requisições e estabilização de buffer via Network Logs.
Permite a visualização fluida de vídeos pesados até mesmo em computadores e conexões mais fracas.

## Stack
- **Front-end**: JavaScript (Extensão do Navegador / Content Scripts)
- **Back-end**: JavaScript (Node.js) / Ruby (Para serviços de telemetria e caching - a definir)

## Funcionalidades Planejadas
- Modificação da heurística de cache do player do YouTube.
- Estabilização do Buffer de vídeo.
- Sincronização e envio de logs na rede para aprendizado e ajuste de rotas.
- Interface (Popup) intuitiva e fluida para gerenciar configurações.
