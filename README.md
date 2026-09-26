# Zellij Web Android — Protótipo de Toolbar de Terminal

Protótipo desktop-first para validação de toolbar de modificadores sticky, teclas especiais e macros ANSI sobre terminal web xterm.js conectado a um PTY real (`node-pty`).

## 🚀 Como executar no NixOS

1. **Entrar no ambiente Nix com toolchain nativo configurado:**
   ```bash
   nix develop
   ```

2. **Instalar dependências (compilação nativa de `node-pty`):**
   ```bash
   npm install
   ```

3. **Iniciar o ambiente de desenvolvimento (Backend PTY + Frontend Vite):**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173`
   - Servidor WebSocket PTY: `ws://localhost:3001`

## ⚙️ Variáveis de Ambiente do Servidor
- `PORT`: Porta do servidor WebSocket (padrão `3001`).
- `SHELL_CMD`: Comando executado no PTY (padrão `$SHELL` ou `bash`). Pode ser configurado como `zellij` para testes diretos (`SHELL_CMD=zellij npm run dev:server`).

## 🎹 Funcionalidades implementadas (SPEC)
- **Modificadores Sticky**: `CTRL`, `ALT`, `SHIFT`, `META` armam no toque e combinam com a próxima tecla, desarmando automaticamente.
- **Teclas especiais ANSI**: `Esc`, `Tab`, `↑ ↓ ← →`, `Home`, `End`, `PgUp`, `PgDn`, `Enter`, `Bksp`.
- **Gaveta de F-keys**: Botão `Fn` com fileira expansível de `F1` até `F12`.
- **Macros com delay**: Botões dedicados como `Detach` (`Ctrl+p` -> `d`), `+Pane` (`Ctrl+p` -> `n`), `NextPane` (`Ctrl+p` -> `p`), etc.
- **Zoom com Reflow Real**: Botões `A-`, `100%`, `A+` e atalho `Ctrl+Scroll` que recalcula tamanho da fonte e propaga `{cols, rows}` via WebSocket para o `node-pty`.
- **Editor de Keymap em Tempo Real**: Botão `⚙️ Config` para carregar, editar JSON e aplicar novas teclas sem reiniciar o servidor.
