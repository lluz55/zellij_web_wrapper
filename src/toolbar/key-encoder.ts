export interface ModifierState {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * Calcula o parametro de modificador xterm para sequencias CSI/Ss3.
 *  mod = 1 + shift(1) + alt(2) + ctrl(4) + meta(8)
 *  ex.: Ctrl+Up = "\x1b[1;5A", Shift+Up = "\x1b[1;2A", Ctrl+Alt+Up = "\x1b[1;7A"
 */
function modifierParam(modifiers: ModifierState): number {
  return (
    1 +
    (modifiers.shift ? 1 : 0) +
    (modifiers.alt ? 2 : 0) +
    (modifiers.meta ? 8 : 0) +
    (modifiers.ctrl ? 4 : 0)
  );
}

/**
 * Aplica modificadores a uma sequencia especial CSI/Ss3, inserindo o parametro "1;<mod>"
 * antes do byte final. Suporta:
 *   - SS3:    \x1b O X              -> \x1b[1;<mod>X
 *   - CSI:    \x1b[X                -> \x1b[1;<mod>X
 *   - CSI~:   \x1b[N~               -> \x1b[N;<mod>~  (F1-F4 = \x1bOP..\x1bOS tambem caem aqui via normalizacao)
 *
 * Se nao houver modificador (ou so Alt/Meta, que ja eh tratado por prefixo Esc),
 * retorna a sequencia inalterada.
 */
export function applyModifierToSpecialSequence(seq: string, modifiers: ModifierState): string {
  const hasNonAlt =
    modifiers.ctrl || modifiers.shift || modifiers.meta;
  if (!hasNonAlt) {
    return seq;
  }

  const mod = modifierParam(modifiers);
  // SS3: \x1b O <final>  -> \x1b[1;<mod><final>
  let m = seq.match(/^\x1bO(.)$/);
  if (m) {
    return `\x1b[1;${mod}${m[1]}`;
  }
  // CSI simples: \x1b[ <final>  -> \x1b[1;<mod><final>
  m = seq.match(/^\x1b\[([ABCDHFM])$/);
  if (m) {
    return `\x1b[1;${mod}${m[1]}`;
  }
  // CSI com parametro: \x1b[<num>~  (PgUp/PgDn/F5-F12) -> \x1b[<num>;<mod>~
  m = seq.match(/^\x1b\[(\d+)~$/);
  if (m) {
    return `\x1b[${m[1]};${mod}~`;
  }
  // CSI com parametro + ~ intermediario (F1-F4 SS3 ja tratado acima)
  return seq;
}

/**
 * Converte um combo ou tecla em bytes/sequencia ANSI.
 * Exemplos:
 * - 'ctrl+c'     -> '\x03'
 * - 'ctrl+p'     -> '\x10'
 * - 'alt+b'      -> '\x1bb'
 * - 'ctrl+['     -> '\x1b'
 * - 'ctrl+shift+c' -> '\x03'  (Shift eh ignorado para letras: terminais recebem so o codigo de controle)
 * - 'shift+tab'  -> '\x1b[Z'  (back-tab)
 * - 'ctrl+up'    -> '\x1b[1;5A'
 */
export function encodeKeyWithModifiers(key: string, modifiers: ModifierState): string {
  const isPrintable = key.length === 1 && key.charCodeAt(0) >= 0x20 && key !== '\t';

  if (isPrintable) {
    let result = key;

    // Ctrl eh aplicado ANTES do Shift, para que Ctrl+Shift+<letra>
    // gere o mesmo codigo de controle que Ctrl+<letra> (como terminais reais).
    if (modifiers.ctrl) {
      const lower = result.toLowerCase();
      const code = lower.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        result = String.fromCharCode(code - 96);
      } else if (result === '@' || result === '`' || result === '2') {
        result = '\x00';
      } else if (result === '[' || result === '3') {
        result = '\x1b';
      } else if (result === '\\' || result === '4') {
        result = '\x1c';
      } else if (result === ']' || result === '5') {
        result = '\x1d';
      } else if (result === '^' || result === '6') {
        result = '\x1e';
      } else if (result === '_' || result === '7') {
        result = '\x1f';
      } else if (result === '?' || result === '8') {
        result = '\x7f';
      }
    } else if (modifiers.shift) {
      // So faz sentido Shift em letra (sem Ctrl): Shift+letra -> maiuscula
      result = result.toUpperCase();
    }

    if (modifiers.alt || modifiers.meta) {
      result = '\x1b' + result;
    }
    return result;
  }

  // Tecla multi-char ou caractere de controle (Esc=\x1b, Tab=\t, setas, F-keys, ...)

  // Shift+Tab -> back-tab (\x1b[Z)
  if (key === '\t' && modifiers.shift && !modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
    return '\x1b[Z';
  }

  // Alt/Meta: prefixa Esc, sem duplicar se a sequencia ja comecar com Esc
  if (modifiers.alt || modifiers.meta) {
    if (key.startsWith('\x1b')) {
      return key;
    }
    return '\x1b' + key;
  }

  // Ctrl/Shift/Meta em sequencia CSI/Ss3 -> injeta parametro 1;<mod>
  if (modifiers.ctrl || modifiers.shift || modifiers.meta) {
    return applyModifierToSpecialSequence(key, modifiers);
  }

  return key;
}

/**
 * Converte uma representacao logica de step (ex: "ctrl+p", "alt+x", "d", "enter", "shift+tab")
 * em sequencia de bytes.
 */
export function parseStepToSequence(step: string, specialSequences: Record<string, string> = {}): string {
  const parts = step.toLowerCase().split('+');
  const mainKey = parts[parts.length - 1];
  const mods: ModifierState = {
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    meta: parts.includes('meta'),
  };

  if (specialSequences[mainKey]) {
    let seq = specialSequences[mainKey];

    // Nao duplicar Esc se a sequencia ja comecar com Esc
    if (mods.alt || mods.meta) {
      if (!seq.startsWith('\x1b')) {
        seq = '\x1b' + seq;
      }
      return seq;
    }

    return encodeKeyWithModifiers(seq, mods);
  }

  return encodeKeyWithModifiers(mainKey, mods);
}
