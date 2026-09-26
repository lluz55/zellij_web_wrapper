i# SPEC — Protótipo de Injeção de Teclas/Combos em Terminal Web

## 1. Contexto

Este documento especifica um protótipo **standalone e desktop-first** cujo único
objetivo é validar a mecânica de uma *toolbar* de teclas/combos customizados
sobre um terminal renderizado no browser — o problema central de usar
`zellij` (ou qualquer terminal via web) no Android, onde não há teclas físicas
de modificador (`Ctrl`, `Alt`, `Esc`, setas, F-keys) nem forma nativa de
disparar combos (`Ctrl+b d`, `Ctrl+p n`, etc.).

Referências que inspiram este design:

- **zellij web client** — já expõe um servidor WebSocket + protocolo próprio
  de terminal, mas sua toolbar mobile é limitada (há inclusive bug conhecido
  de digitação duplicada no Android).
- **`njreid/zelland`** — cliente Android nativo (Tauri) que embrulha o zellij
  web e implementa uma IME/toolbar própria (`KeybarPlugin.kt`, `KeySeqs.kt`).
- **`jmfederico/pi-web`** — UI web para um agente de coding que mantém
  sessões de terminal reais (via `node-pty`) vivas no servidor e expõe
  atalhos de teclado configuráveis pelo usuário (`keymap` no arquivo de
  config). O padrão de notação `modifier+key` (`ctrl+alt+t`, `ctrl+shift+p`)
  usado por esse tipo de ferramenta é a base do modelo de dados abaixo.

Este protótipo **não** depende de zellij nem do zellij-web rodando — ele cria
seu próprio terminal real (via `node-pty`) para que a UX de teclas/combos
possa ser testada de ponta a ponta (tecla pressionada na toolbar → byte
chega no processo do shell) sem a complexidade adicional do protocolo do
zellij.

## 2. Objetivo

Construir uma aplicação web local (`localhost`) com:

1. Um terminal real e funcional no browser (via `xterm.js` + `node-pty` +
   WebSocket).
2. Uma **toolbar de teclas customizadas** sobreposta ao terminal, com botões
   para modificadores, teclas especiais e combos/macros configuráveis.
3. Controles de **zoom** do terminal (aumentar/diminuir fonte, com reflow
   real do grid de colunas/linhas — não escala CSS).
4. Um mecanismo de **configuração de teclas/combos** via arquivo JSON,
   editável e recarregável em tempo real, para poder iterar rápido em quais
   teclas fazem sentido antes de desenhar a versão mobile.

O critério de sucesso é: alguém consegue operar `vim`, `zellij` (rodando
*dentro* do pty deste protótipo, como CLI normal) ou qualquer TUI, usando
**apenas mouse/touch na toolbar**, sem nunca tocar no teclado físico.

## 3. Fora de escopo (nesta fase)

- Capacitor, WebView Android, empacotamento mobile — fica para uma fase 2.
- Integração com o protocolo web do zellij (WebSocket próprio do
  `zellij web`) — fase 2, depois que a UX da toolbar estiver validada aqui.
- Autenticação, multiusuário, múltiplas sessões simultâneas.
- Persistência de sessão entre reloads (resurrect) — o pty pode morrer ao
  recarregar a página.
- Suporte a temas, temas claro/escuro, customização visual além do mínimo.

## 4. Arquitetura

```
┌─────────────────────────────┐         ┌───────────────────────────┐
│         Browser              │  WS     │     Servidor Node          │
│                               │◄───────►│                            │
│  ┌────────────┐ ┌──────────┐ │ bytes   │  ┌──────────┐  ┌────────┐  │
│  │  xterm.js   │ │ Toolbar  │ │         │  │   ws      │→│node-pty│  │
│  │  (render)   │ │ (teclas/ │ │         │  │  server  │  │ (bash/ │  │
│  │             │ │  combos) │ │         │  │          │  │ zellij)│  │
│  └────────────┘ └──────────┘ │         │  └──────────┘  └────────┘  │
└─────────────────────────────┘         └───────────────────────────┘
```

- **Transporte**: um único WebSocket bidirecional. Do cliente para o
  servidor só trafegam bytes (o que o `xterm.js` normalmente manda via
  teclado físico *e* o que a toolbar manda). Do servidor para o cliente
  trafega a saída bruta do pty.
- **A toolbar não é um "atalho de teclado do browser"** — ela gera as
  mesmas sequências de bytes que um teclado físico geraria, e as escreve no
  mesmo canal. Isso é o ponto central do protótipo: a toolbar deve ser
  indistinguível, do ponto de vista do processo no pty, de um teclado real.

## 5. Componentes

### 5.1 Backend — `server/`

- `server/index.ts`: sobe um servidor HTTP + WebSocket (`ws`).
- Ao conectar um cliente, cria (ou reusa) um processo via `node-pty`
  (`bash -l` por padrão; configurável via `.env` para já testar com
  `zellij attach` ou `zellij` puro).
- Encaminha `pty.onData` → `ws.send` e `ws.onmessage` → `pty.write`.
- Trata `resize` (mensagem JSON `{type: "resize", cols, rows}`) chamando
  `pty.resize(cols, rows)` — necessário para o zoom com reflow real.

### 5.2 Frontend — terminal — `src/terminal/`

- `xterm.js` + addon `fit` para redimensionar ao container.
- Um addon de zoom customizado: em vez de `font-size` CSS puro, altera
  `terminal.options.fontSize`, chama `fitAddon.fit()` e manda o novo
  `{cols, rows}` pro servidor via `resize`. Isso é o comportamento correto
  (o mesmo que o zellij faz internamente) — TUIs como `vim`/`htop` reagem
  certo ao novo grid, em vez de ficarem borradas/cortadas.
- Botões de zoom: `A-` / `A+` / reset, e suporte a `Ctrl+scroll` (desktop)
  e pinch (stub — só necessário quando for tocar em touch real, mas a
  função que recalcula fonte já deve ser reaproveitável).

### 5.3 Toolbar de teclas — `src/toolbar/`

Componente de UI fixo (barra inferior, estilo teclado de app de terminal
mobile) com:

- **Modificadores com estado "sticky"**: `Ctrl`, `Alt`, `Shift`, `Meta`
  funcionam como toggle — usuário toca `Ctrl` (fica destacado/ativo),
  depois toca `c`, e o resultado é `Ctrl+c` enviado como uma única
  sequência; o estado do modificador é resetado após o próximo caractere.
  Este é o padrão usado por teclados de terminal mobile (inclusive
  `zelland`) e resolve o problema de não existir combo físico no touch.
- **Teclas especiais** sempre visíveis: `Esc`, `Tab`, `↑ ↓ ← →`,
  `PgUp/PgDn`, `Home/End`, `Enter`, `Backspace`.
- **Fileira de F-keys** (`F1`–`F12`) colapsável.
- **Botão de macro**: dispara uma sequência pré-configurada de várias
  teclas/combos em ordem (ex.: `Ctrl+b` seguido de `d` para detach de
  tmux/zellij, ou `Ctrl+p` seguido de `n` no caso de zellij).
- Toda tecla/macro tocada dá feedback visual (highlight breve) para o
  usuário confirmar que o toque registrou — importante porque não há
  "click" tátil como num teclado físico.

### 5.4 Configuração — `keymap.json`

Arquivo carregado no boot do frontend (via `fetch` local, sem precisar
rebuildar) definindo os botões da toolbar. Ver schema na seção 6.

### 5.5 Painel de edição (opcional, "nice to have" dentro do protótipo)

Uma tela simples (pode ser um `<textarea>` com o JSON cru) para editar o
`keymap.json` e re-aplicar sem reiniciar o servidor — acelera iteração de
design da toolbar.

## 6. Modelo de dados — `keymap.json`

Notação de tecla inspirada no padrão `modifier+key` usado por ferramentas
como o Pi coding agent (`ctrl+alt+t`, `ctrl+shift+p`):

```json
{
  "modifiers": ["ctrl", "alt", "shift", "meta"],
  "specialKeys": [
    { "id": "esc", "label": "Esc", "sequence": "\u001b" },
    { "id": "tab", "label": "Tab", "sequence": "\t" },
    { "id": "up", "label": "↑", "sequence": "\u001b[A" },
    { "id": "down", "label": "↓", "sequence": "\u001b[B" },
    { "id": "left", "label": "←", "sequence": "\u001b[D" },
    { "id": "right", "label": "→", "sequence": "\u001b[C" },
    { "id": "pgup", "label": "PgUp", "sequence": "\u001b[5~" },
    { "id": "pgdn", "label": "PgDn", "sequence": "\u001b[6~" }
  ],
  "functionKeys": [
    { "id": "f1", "label": "F1", "sequence": "\u001bOP" }
  ],
  "macros": [
    {
      "id": "zellij-detach",
      "label": "Detach",
      "steps": ["ctrl+p", "d"]
    },
    {
      "id": "zellij-new-pane",
      "label": "+Pane",
      "steps": ["ctrl+p", "n"]
    }
  ]
}
```

Regras de resolução:

- `modifiers` + uma tecla imprimível (`ctrl+c`) → calculado em runtime para
  o código de controle correto (`ctrl+<letra>` = `charCode - 96`), não
  fica hardcoded por combo — evita ter que listar manualmente todas as
  combinações de letras.
- `specialKeys`/`functionKeys` têm `sequence` explícita (bytes/escapes
  ANSI) porque não seguem regra aritmética simples.
- `macros.steps` é uma lista ordenada de "teclas lógicas" (podem ser
  combos como `ctrl+p` ou teclas simples como `d`), disparadas em sequência
  com um pequeno delay configurável entre elas (necessário porque alguns
  programas fazem *time out* de prefixo, ex. `tmux`/`zellij`).

## 7. Requisitos funcionais

| ID | Requisito |
|----|-----------|
| RF01 | O usuário deve conseguir digitar normalmente pelo teclado físico e ver o eco no terminal (baseline). |
| RF02 | Tocar um modificador na toolbar deve destacá-lo visualmente e mantê-lo "armado" até a próxima tecla. |
| RF03 | Tocar uma tecla com modificador(es) armado(s) deve enviar o combo correto ao pty e desarmar os modificadores. |
| RF04 | Tocar uma tecla especial (seta, Esc, Tab, PgUp/Dn, F-keys) deve enviar a sequência ANSI correta, mesmo sem modificador ativo. |
| RF05 | Tocar um botão de macro deve disparar todos os `steps` em ordem, respeitando delay entre eles. |
| RF06 | Os botões `A+`/`A-`/reset devem alterar o tamanho da fonte do terminal e re-emitir um `resize` correto para o pty. |
| RF07 | O `keymap.json` deve poder ser trocado e recarregado sem reiniciar o servidor Node. |
| RF08 | O usuário deve poder abrir `zellij` dentro do pty deste protótipo e usar a toolbar para operá-lo (teste de aceitação principal). |

## 8. Requisitos não funcionais

- Rodar 100% local (`localhost`), sem dependência de rede externa.
- Latência da toolbar → eco no terminal deve ser imperceptível (<50ms em
  localhost).
- Código simples o bastante para ser descartado/reescrito ao migrar para
  Capacitor/Android na fase 2 — não otimizar prematuramente para reuso
  mobile.

## 9. Stack técnica

- **Runtime**: Node.js (via `nixpkgs`, não via `nvm`).
- **Backend**: `ws`, `node-pty`, TypeScript, `tsx` para dev sem build step.
- **Frontend**: Vite + TypeScript vanilla (sem framework — o protótipo não
  precisa de React/Vue; menos superfície pra manter). `xterm.js` +
  `@xterm/addon-fit`.
- **Sem Capacitor, sem build Android nesta fase.**

### 9.1 Ambiente de dev (NixOS) — `flake.nix`

```nix
{
  description = "Prototipo toolbar terminal";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.nodejs_22
          pkgs.python3      # node-gyp precisa pra compilar node-pty
          pkgs.pkg-config
        ];
        # node-pty tem binding nativo — garante toolchain de build disponível
        shellHook = ''
          export npm_config_build_from_source=true
        '';
      };
    };
}
```

> Nota: `node-pty` compila um módulo nativo (`node-gyp`). Em NixOS isso
> costuma exigir `python3`, `pkg-config` e um compilador C++ no
> `devShell` — se `npm install` falhar, o erro geralmente aponta pra falta
> de um desses. Alternativa mais hermética: empacotar via
> `pkgs.buildNpmPackage`, mas para um protótipo o `devShell` simples acima
> deve bastar.

## 10. Estrutura de diretórios sugerida

```
prototipo-toolbar/
├── flake.nix
├── package.json
├── keymap.json
├── server/
│   └── index.ts
└── src/
    ├── main.ts
    ├── terminal/
    │   ├── terminal.ts       # setup do xterm.js + fit + zoom
    │   └── ws-client.ts      # conexão WS, encode/decode de mensagens
    └── toolbar/
        ├── toolbar.ts        # render da toolbar a partir do keymap.json
        ├── key-encoder.ts    # lógica modifier+key -> bytes
        └── macro-runner.ts   # execução sequencial de macros com delay
```

## 11. Plano de execução (milestones)

1. **M1 — Terminal funcional**: servidor WS + `node-pty` + `xterm.js`
   mostrando um shell real no browser, sem toolbar ainda.
2. **M2 — Zoom com reflow**: botões `A+`/`A-`, `resize` propagado
   corretamente (validar rodando `htop` e redimensionando).
3. **M3 — Toolbar estática**: modificadores + teclas especiais funcionando
   (RF02–RF04), lendo de um `keymap.json` fixo.
4. **M4 — Macros**: RF05, testado especificamente disparando `Ctrl+b d`
   ou equivalente dentro de uma sessão `tmux`/`zellij` rodando no pty.
5. **M5 — Reload de config**: RF07.
6. **M6 — Teste de aceite**: instalar e operar `zellij` inteiramente via
   toolbar dentro do protótipo, documentar fricções encontradas.

## 12. Critérios de aceite / Definition of Done

- Todos os RF01–RF08 verificados manualmente (checklist, sem necessidade
  de suite automatizada nesta fase).
- Uma sessão de `zellij` consegue ser aberta, ter panes criados/fechados,
  e ter foco alternado entre elas, usando **apenas** a toolbar.
- Lista de "teclas que faltaram" documentada a partir do teste M6 — vira
  input direto para o `keymap.json` "de produção" da fase Android.

## 13. Riscos e questões em aberto

- **Delay entre steps de macro**: valor fixo pode não servir para todo
  programa; talvez precise ser configurável por macro.
- **node-pty em NixOS**: risco de fricção de build nativo — validar cedo
  (M1) antes de investir no resto.
- **Diferença entre este pty local e o protocolo real do zellij web**: o
  encoder de teclas (seção 6) deve ser desenhado de forma isolada
  (`key-encoder.ts` puro, sem acoplamento ao transporte) justamente para
  poder ser reaproveitado quando o transporte trocar de "WebSocket cru
  para pty" para "WebSocket do protocolo do zellij" na fase 2.

## 14. Fora do escopo, mas para onde isso caminha (fase 2+)

- Trocar o backend deste protótipo por um cliente do protocolo web do
  zellij (falar diretamente com `zellij web`/WebSocket dele em vez de
  criar nosso próprio pty).
- Portar a toolbar para dentro de um WebView Android (Capacitor ou Tauri,
  a decidir) reaproveitando `key-encoder.ts` e `keymap.json` como estão.
- Gestos touch reais (swipe, pinch) substituindo os botões de zoom stub.