import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WsClient } from './ws-client';
import { ModifierState, encodeKeyWithModifiers, applyModifierToSpecialSequence } from '../toolbar/key-encoder';

export type ViewportMode = 'responsive' | 'fixed-desktop';

export interface TerminalManagerOptions {
  container: HTMLElement;
  wsClient: WsClient;
  initialFontSize?: number;
  onDimensionsChanged?: (cols: number, rows: number, fontSize: number, mode: ViewportMode) => void;
  getModifiers?: () => ModifierState;
  hasActiveModifiers?: () => boolean;
  clearModifiers?: () => void;
}

export class TerminalManager {
  public terminal: Terminal;
  public fitAddon: FitAddon;
  private wsClient: WsClient;
  private fontSize: number;
  private baseFontSize: number;
  private viewportMode: ViewportMode = 'responsive';
  private container: HTMLElement;
  private onDimensionsChanged?: (cols: number, rows: number, fontSize: number, mode: ViewportMode) => void;

  private getModifiers?: () => ModifierState;
  private hasActiveModifiers?: () => boolean;
  private clearModifiers?: () => void;

  constructor(options: TerminalManagerOptions) {
    this.container = options.container;
    this.wsClient = options.wsClient;
    this.baseFontSize = options.initialFontSize || 14;
    this.fontSize = this.baseFontSize;
    this.onDimensionsChanged = options.onDimensionsChanged;
    this.getModifiers = options.getModifiers;
    this.hasActiveModifiers = options.hasActiveModifiers;
    this.clearModifiers = options.clearModifiers;

    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: this.fontSize,
      fontFamily: 'monospace, "Fira Code", "Courier New", Courier',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
      },
      allowTransparency: false,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(options.container);

    // Forward terminal input directly to WebSocket, applying armed sticky modifiers
    // from the virtual keyboard. Importante: so aplicar modificadores e
    // desarma-los em entradas de UM caractere. Teclas especiais (Esc, setas,
    // Enter do teclado virtual, etc.) chegam como sequences > 1 e devem passar
    // diretas, senao cada Enter do teclado virtual do mobile desarma o Ctrl
    // e dispara render() na toolbar no meio do toque.
    this.terminal.onData((data) => {
      const hasMods = this.hasActiveModifiers && this.hasActiveModifiers() && this.getModifiers;
      if (!hasMods) {
        this.wsClient.send(data);
        return;
      }
      const mods = this.getModifiers!();
      let finalData = data;
      if (data.length === 1) {
        finalData = encodeKeyWithModifiers(data, mods);
        this.clearModifiers?.();
      } else {
        if (mods.alt || mods.meta) {
          if (!data.startsWith('\x1b')) {
            finalData = '\x1b' + data;
          }
        } else if (mods.ctrl || mods.shift || mods.meta) {
          finalData = applyModifierToSpecialSequence(data, mods);
        }
        // Para sequencias multi-char (Enter, seta, F-key do teclado virtual)
        // NAO limpar modificadores: o usuario pode estar armando Ctrl para
        // uma combinacao, e o teclado virtual do SO pode mandar Enter/Backspace
        // como parte de edicao normal.
      }
      this.wsClient.send(finalData);
    });

    // Auto-fit on window resize (if in responsive mode)
    window.addEventListener('resize', () => {
      if (this.viewportMode === 'responsive') {
        this.fit();
      }
    });

    // Desktop Ctrl+wheel zoom support
    options.container.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          if (e.deltaY < 0) {
            this.zoomIn();
          } else if (e.deltaY > 0) {
            this.zoomOut();
          }
        }
      },
      { passive: false }
    );

    // Initial fit
    setTimeout(() => {
      this.fit();
    }, 100);
  }

  public setModifierHooks(hooks: {
    getModifiers: () => ModifierState;
    hasActiveModifiers: () => boolean;
    clearModifiers: () => void;
  }) {
    this.getModifiers = hooks.getModifiers;
    this.hasActiveModifiers = hooks.hasActiveModifiers;
    this.clearModifiers = hooks.clearModifiers;
  }

  public fit() {
    try {
      if (this.viewportMode === 'responsive') {
        this.container.classList.remove('viewport-fixed-desktop');
        this.fitAddon.fit();
        const cols = this.terminal.cols;
        const rows = this.terminal.rows;
        this.wsClient.sendResize(cols, rows);
        this.onDimensionsChanged?.(cols, rows, this.fontSize, this.viewportMode);
      } else {
        // Fixed Full Desktop session mode (e.g. 120 cols x 34 rows) with pan/scroll
        this.container.classList.add('viewport-fixed-desktop');
        const cols = 120;
        const rows = 34;
        this.terminal.resize(cols, rows);
        this.wsClient.sendResize(cols, rows);
        this.onDimensionsChanged?.(cols, rows, this.fontSize, this.viewportMode);
      }
    } catch (err) {
      console.warn('[TerminalManager] fit error:', err);
    }
  }

  public toggleViewportMode(): ViewportMode {
    this.viewportMode = this.viewportMode === 'responsive' ? 'fixed-desktop' : 'responsive';
    this.fit();
    return this.viewportMode;
  }

  public setViewportMode(mode: ViewportMode) {
    this.viewportMode = mode;
    this.fit();
  }

  public getViewportMode(): ViewportMode {
    return this.viewportMode;
  }

  public setFontSize(size: number) {
    const clamped = Math.max(8, Math.min(36, size));
    this.fontSize = clamped;
    this.terminal.options.fontSize = clamped;
    this.fit();
  }

  public zoomIn() {
    this.setFontSize(this.fontSize + 2);
  }

  public zoomOut() {
    this.setFontSize(this.fontSize - 2);
  }

  public resetZoom() {
    this.setFontSize(this.baseFontSize);
  }

  public getFontSize(): number {
    return this.fontSize;
  }
}
