import { KeymapConfig, SendDataFn } from './types';
import { ModifierState, encodeKeyWithModifiers } from './key-encoder';
import { executeMacro } from './macro-runner';

export class Toolbar {
  private container: HTMLElement;
  private sendData: SendDataFn;
  private config: KeymapConfig;
  private specialSequences: Record<string, string> = {};

  private modifiers: ModifierState = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  private modifierButtons: Map<string, HTMLButtonElement> = new Map();
  private showFnKeys = false;
  private showZellijPalette = false;

  constructor(container: HTMLElement, config: KeymapConfig, sendData: SendDataFn) {
    this.container = container;
    this.config = config;
    this.sendData = sendData;
    this.updateSpecialSequences();
    this.render();
  }

  public updateConfig(newConfig: KeymapConfig) {
    this.config = newConfig;
    this.updateSpecialSequences();
    this.render();
  }

  private updateSpecialSequences() {
    this.specialSequences = {};
    if (this.config.specialKeys) {
      for (const key of this.config.specialKeys) {
        if (key.sequence) {
          this.specialSequences[key.id.toLowerCase()] = key.sequence;
          this.specialSequences[key.label.toLowerCase()] = key.sequence;
        }
      }
    }
    if (this.config.functionKeys) {
      for (const key of this.config.functionKeys) {
        if (key.sequence) {
          this.specialSequences[key.id.toLowerCase()] = key.sequence;
          this.specialSequences[key.label.toLowerCase()] = key.sequence;
        }
      }
    }
  }

  public triggerVisualFeedback(button: HTMLElement) {
    button.classList.add('active-flash');
    setTimeout(() => {
      button.classList.remove('active-flash');
    }, 120);
  }

  public toggleModifier(mod: 'ctrl' | 'alt' | 'shift' | 'meta') {
    this.modifiers[mod] = !this.modifiers[mod];
    this.render(); // Re-renderiza para exibir/esconder painéis flutuantes contextuais de Ctrl ou Alt
  }

  public clearModifiers() {
    this.modifiers = { ctrl: false, alt: false, shift: false, meta: false };
    this.render();
  }

  public hasActiveModifiers(): boolean {
    return this.modifiers.ctrl || this.modifiers.alt || this.modifiers.shift || this.modifiers.meta;
  }

  public getModifiers(): ModifierState {
    return { ...this.modifiers };
  }

  public sendSequence(sequence: string, element?: HTMLElement) {
    if (element) this.triggerVisualFeedback(element);
    let finalSeq = sequence;
    if (this.hasActiveModifiers()) {
      if (finalSeq.length === 1) {
        finalSeq = encodeKeyWithModifiers(finalSeq, this.modifiers);
      } else if (this.modifiers.alt || this.modifiers.meta) {
        finalSeq = '\x1b' + finalSeq;
      }
      this.clearModifiers();
    }
    this.sendData(finalSeq);
  }

  public render() {
    this.container.innerHTML = '';
    this.modifierButtons.clear();

    // 1. Popup flutuante contextual para CTRL
    if (this.modifiers.ctrl && this.config.ctrlShortcuts && this.config.ctrlShortcuts.length > 0) {
      const ctrlPopup = document.createElement('div');
      ctrlPopup.className = 'floating-modifier-tray ctrl-tray';

      const title = document.createElement('span');
      title.className = 'tray-title';
      title.textContent = 'CTRL +';
      ctrlPopup.appendChild(title);

      for (const item of this.config.ctrlShortcuts) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-tray-action btn-tray-ctrl';
        btn.textContent = item.label;
        btn.title = item.description || item.label;
        btn.onclick = (e) => {
          e.preventDefault();
          this.triggerVisualFeedback(btn);
          if (item.sequence) {
            this.sendData(item.sequence);
          }
          this.clearModifiers();
        };
        ctrlPopup.appendChild(btn);
      }
      this.container.appendChild(ctrlPopup);
    }

    // 2. Popup flutuante contextual para ALT
    if (this.modifiers.alt && this.config.altShortcuts && this.config.altShortcuts.length > 0) {
      const altPopup = document.createElement('div');
      altPopup.className = 'floating-modifier-tray alt-tray';

      const title = document.createElement('span');
      title.className = 'tray-title';
      title.textContent = 'ALT +';
      altPopup.appendChild(title);

      for (const item of this.config.altShortcuts) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-tray-action btn-tray-alt';
        btn.textContent = item.label;
        btn.title = item.description || item.label;
        btn.onclick = (e) => {
          e.preventDefault();
          this.triggerVisualFeedback(btn);
          if (item.sequence) {
            this.sendData(item.sequence);
          }
          this.clearModifiers();
        };
        altPopup.appendChild(btn);
      }
      this.container.appendChild(altPopup);
    }

    // 3. Gaveta Zellij (se ativada)
    if (this.showZellijPalette && this.config.zellijQuickActions) {
      const palette = document.createElement('div');
      palette.className = 'terminal-toolbar zellij-palette';

      for (const action of this.config.zellijQuickActions) {
        const btn = document.createElement('button');
        btn.className = `btn btn-zellij-action category-${action.category || 'general'}`;
        btn.textContent = action.label;
        btn.title = action.description || action.label;

        btn.onclick = async (e) => {
          e.preventDefault();
          this.triggerVisualFeedback(btn);
          if (action.commandText) {
            this.sendData(action.commandText);
          } else if (action.steps) {
            await executeMacro(action.steps, (data) => this.sendData(data), this.specialSequences);
          }
        };

        palette.appendChild(btn);
      }
      this.container.appendChild(palette);
    }

    // 4. Gaveta Fn (F1-F12) se ativada
    if (this.showFnKeys && this.config.functionKeys && this.config.functionKeys.length > 0) {
      const fnDrawer = document.createElement('div');
      fnDrawer.className = 'terminal-toolbar fn-drawer';
      for (const fKey of this.config.functionKeys) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-fn';
        btn.textContent = fKey.label;
        btn.onclick = (e) => {
          e.preventDefault();
          if (fKey.sequence) {
            this.sendSequence(fKey.sequence, btn);
          }
        };
        fnDrawer.appendChild(btn);
      }
      this.container.appendChild(fnDrawer);
    }

    // 5. Barra Base Principal (Toolbar sempre visível)
    const barEl = document.createElement('div');
    barEl.className = 'terminal-toolbar base-toolbar';

    // 5.1 Modificadores (CTRL, ALT, SHIFT)
    const modGroup = document.createElement('div');
    modGroup.className = 'button-group modifiers-group';

    const supportedMods: Array<'ctrl' | 'alt' | 'shift' | 'meta'> = ['ctrl', 'alt', 'shift'];
    for (const mod of supportedMods) {
      if (this.config.modifiers.includes(mod)) {
        const btn = document.createElement('button');
        const isActive = this.modifiers[mod];
        btn.className = `btn btn-modifier btn-${mod} ${isActive ? 'sticky-active' : ''}`;
        btn.textContent = mod.toUpperCase();
        btn.title = `Alternar modificador ${mod.toUpperCase()}`;
        btn.onclick = (e) => {
          e.preventDefault();
          this.toggleModifier(mod);
        };
        this.modifierButtons.set(mod, btn);
        modGroup.appendChild(btn);
      }
    }
    barEl.appendChild(modGroup);

    // 5.2 Teclas de navegação e controle essenciais
    const specialGroup = document.createElement('div');
    specialGroup.className = 'button-group special-group';

    for (const key of this.config.specialKeys) {
      const btn = document.createElement('button');
      btn.className = `btn btn-special btn-${key.id}`;
      btn.textContent = key.label;
      btn.title = `Tecla ${key.label}`;
      btn.onclick = (e) => {
        e.preventDefault();
        if (key.sequence) {
          this.sendSequence(key.sequence, btn);
        }
      };
      specialGroup.appendChild(btn);
    }
    barEl.appendChild(specialGroup);

    // 5.3 Botão Fn
    if (this.config.functionKeys && this.config.functionKeys.length > 0) {
      const fnToggleBtn = document.createElement('button');
      fnToggleBtn.className = `btn btn-toggle-fn ${this.showFnKeys ? 'active' : ''}`;
      fnToggleBtn.textContent = 'Fn';
      fnToggleBtn.title = 'Mostrar/Ocultar teclas F1-F12';
      fnToggleBtn.onclick = (e) => {
        e.preventDefault();
        this.showFnKeys = !this.showFnKeys;
        this.render();
      };
      barEl.appendChild(fnToggleBtn);
    }

    // 5.4 Botão Central de Ações do Zellij (Substitui macros duplicadas)
    const zellijHubBtn = document.createElement('button');
    zellijHubBtn.className = `btn btn-zellij-hub ${this.showZellijPalette ? 'active' : ''}`;
    zellijHubBtn.innerHTML = '⚡ Ações Zellij';
    zellijHubBtn.title = 'Painel com ações avançadas de splits, abas e sessões';
    zellijHubBtn.onclick = (e) => {
      e.preventDefault();
      this.showZellijPalette = !this.showZellijPalette;
      this.render();
    };
    barEl.appendChild(zellijHubBtn);

    this.container.appendChild(barEl);
  }
}
