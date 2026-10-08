import { TerminalManager } from './terminal/terminal';
import { WsClient } from './terminal/ws-client';
import { Toolbar } from './toolbar/toolbar';
import { KeymapConfig } from './toolbar/types';

const isHttps = window.location.protocol === 'https:';
const wsProto = isHttps ? 'wss:' : 'ws:';
// Remove trailing slashes to form base prefix (e.g. "/zellij" or "")
const basePath = window.location.pathname.replace(/\/+$/, '');
const WS_URL = `${wsProto}//${window.location.host}${basePath}`;
const API_URL = `${window.location.origin}${basePath}`;

// Elements
const terminalContainer = document.getElementById('terminal-container') as HTMLElement;
const toolbarContainer = document.getElementById('toolbar-container') as HTMLElement;
const statusBadge = document.getElementById('connection-status') as HTMLElement;
const dimensionsBadge = document.getElementById('dimensions-badge') as HTMLElement;

const sessionSelect = document.getElementById('session-select') as HTMLSelectElement;
const zellijOptgroup = document.getElementById('zellij-sessions-optgroup') as HTMLOptGroupElement;
const btnReconnect = document.getElementById('btn-reconnect') as HTMLButtonElement;
const btnToggleViewport = document.getElementById('btn-toggle-viewport') as HTMLButtonElement;

const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement;
const btnZoomReset = document.getElementById('btn-zoom-reset') as HTMLButtonElement;

const btnOpenConfig = document.getElementById('btn-open-config') as HTMLButtonElement;
const btnCloseModal = document.getElementById('btn-close-modal') as HTMLButtonElement;
const btnReloadFile = document.getElementById('btn-reload-file') as HTMLButtonElement;
const btnApplyKeymap = document.getElementById('btn-apply-keymap') as HTMLButtonElement;
const configModal = document.getElementById('config-modal') as HTMLElement;
const keymapEditor = document.getElementById('keymap-editor') as HTMLTextAreaElement;

let toolbar: Toolbar | null = null;
let currentKeymap: KeymapConfig | null = null;

// Setup WebSocket Client
const wsClient = new WsClient(WS_URL);

// Setup Terminal
const terminalManager = new TerminalManager({
  container: terminalContainer,
  wsClient: wsClient,
  initialFontSize: 14,
  onDimensionsChanged: (cols, rows, fontSize, mode) => {
    const modeTag = mode === 'responsive' ? '📱' : '🖥️ Desktop';
    dimensionsBadge.textContent = `${modeTag} ${cols}x${rows} (${fontSize}px)`;
  },
});

// Mobile: garantir que tocar na area do terminal foca o xterm (user gesture).
// Sem isso o Safari iOS ignora o .focus() programatico e o teclado virtual
// do SO nunca sobe, fazendo a barra de atalhos parecer morta.
terminalContainer.addEventListener(
  'pointerdown',
  () => {
    terminalManager.terminal.focus();
  },
  { passive: true }
);
terminalContainer.addEventListener(
  'touchstart',
  () => {
    terminalManager.terminal.focus();
  },
  { passive: true }
);

// Toggle between Responsive (mobile screen fit) and Full Desktop Session (120x34)
btnToggleViewport.onclick = () => {
  const newMode = terminalManager.toggleViewportMode();
  if (newMode === 'responsive') {
    btnToggleViewport.textContent = '📱 Tela Reduzida';
    btnToggleViewport.title = 'Alternar para Sessão Completa Desktop (120x34)';
  } else {
    btnToggleViewport.textContent = '🖥️ Sessão Completa';
    btnToggleViewport.title = 'Alternar para Tela Reduzida (ajustada à tela do celular)';
  }
};

// Connect WebSocket with selected session mode
function connectTerminalSession() {
  const selected = sessionSelect.value;
  let mode = 'default';
  let sessionName = '';

  if (selected === 'default') {
    mode = 'default';
  } else if (selected === 'zellij-new') {
    mode = 'zellij-new';
  } else if (selected.startsWith('attach:')) {
    mode = 'zellij-attach';
    sessionName = selected.replace('attach:', '');
  }

  terminalManager.terminal.reset();
  terminalManager.terminal.write('\x1b[2J\x1b[H\x1b[36m[Conectando à sessão: ' + (sessionName || selected) + '...]\x1b[0m\r\n');

  wsClient.connect(
    { mode, session: sessionName },
    () => {
      statusBadge.textContent = 'Conectado';
      statusBadge.className = 'status-badge status-connected';
      terminalManager.fit();
      terminalManager.terminal.focus();
    },
    (data) => {
      terminalManager.terminal.write(data);
    },
    () => {
      statusBadge.textContent = 'Desconectado';
      statusBadge.className = 'status-badge status-disconnected';
    }
  );
}

// Fetch available Zellij sessions from server
async function fetchSessions() {
  try {
    const res = await fetch(`${API_URL}/api/sessions`);
    if (!res.ok) return;
    const data = await res.json();
    zellijOptgroup.innerHTML = '';

    if (data.sessions && data.sessions.length > 0) {
      for (const s of data.sessions) {
        const option = document.createElement('option');
        option.value = `attach:${s.name}`;
        option.textContent = s.raw || s.name;
        zellijOptgroup.appendChild(option);
      }
    } else {
      const option = document.createElement('option');
      option.disabled = true;
      option.textContent = '(Nenhuma sessão zellij ativa)';
      zellijOptgroup.appendChild(option);
    }
  } catch (err) {
    console.warn('[main] Falha ao carregar sessões zellij:', err);
  }
}

btnReconnect.onclick = () => {
  connectTerminalSession();
};

sessionSelect.onchange = () => {
  connectTerminalSession();
};

// Zoom buttons handlers
btnZoomIn.onclick = () => {
  terminalManager.zoomIn();
  btnZoomReset.textContent = `${Math.round((terminalManager.getFontSize() / 14) * 100)}%`;
};

btnZoomOut.onclick = () => {
  terminalManager.zoomOut();
  btnZoomReset.textContent = `${Math.round((terminalManager.getFontSize() / 14) * 100)}%`;
};

btnZoomReset.onclick = () => {
  terminalManager.resetZoom();
  btnZoomReset.textContent = '100%';
};

// Fetch and initialize Keymap
async function loadKeymap(): Promise<KeymapConfig> {
  const res = await fetch(`${API_URL}/keymap.json?t=` + Date.now());
  if (!res.ok) throw new Error(`Falha ao ler keymap.json: ${res.statusText}`);
  const data = await res.json();
  return data as KeymapConfig;
}

async function initToolbar() {
  try {
    currentKeymap = await loadKeymap();
    toolbar = new Toolbar(toolbarContainer, currentKeymap, (seq) => {
      // No mobile, NAO chamar terminalManager.terminal.focus() apos cada
      // toque da barra: o focus() tenta abrir o teclado virtual do SO, que
      // cobre a barra, e o toque seguinte e consumido pelo re-layout. Os
      // botoes ja enviam a sequencia correta direto pelo WebSocket.
      wsClient.send(seq);
    });

    // Wire up terminal virtual keyboard with toolbar modifiers!
    terminalManager.setModifierHooks({
      getModifiers: () => toolbar!.getModifiers(),
      hasActiveModifiers: () => toolbar!.hasActiveModifiers(),
      clearModifiers: () => toolbar!.clearModifiers(),
    });

    keymapEditor.value = JSON.stringify(currentKeymap, null, 2);
  } catch (err) {
    console.error('Erro ao carregar keymap:', err);
  }
}

// Modal Config logic
btnOpenConfig.onclick = () => {
  if (currentKeymap) {
    keymapEditor.value = JSON.stringify(currentKeymap, null, 2);
  }
  configModal.classList.remove('hidden');
};

btnCloseModal.onclick = () => {
  configModal.classList.add('hidden');
};

btnReloadFile.onclick = async () => {
  try {
    currentKeymap = await loadKeymap();
    keymapEditor.value = JSON.stringify(currentKeymap, null, 2);
    toolbar?.updateConfig(currentKeymap);
    alert('Keymap recarregado do arquivo public/keymap.json!');
  } catch (err) {
    alert(`Erro ao recarregar: ${(err as Error).message}`);
  }
};

btnApplyKeymap.onclick = () => {
  try {
    const parsed = JSON.parse(keymapEditor.value);
    currentKeymap = parsed;
    toolbar?.updateConfig(currentKeymap!);
    configModal.classList.add('hidden');
  } catch (err) {
    alert(`JSON inválido: ${(err as Error).message}`);
  }
};

// Start
initToolbar();
fetchSessions().then(() => {
  connectTerminalSession();
});
