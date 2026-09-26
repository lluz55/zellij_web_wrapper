export type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

export interface ModifierState {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * Converte um combo ou tecla em bytes/sequência ANSI.
 * Exemplos:
 * - 'ctrl+c' -> '\x03'
 * - 'ctrl+p' -> '\x10'
 * - 'alt+b'  -> '\x1bb'
 * - 'ctrl+[' -> '\x1b'
 */
export function encodeKeyWithModifiers(key: string, modifiers: ModifierState): string {
  let result = key;

  // Letra/caractere único
  if (result.length === 1) {
    if (modifiers.shift) {
      result = result.toUpperCase();
    }

    if (modifiers.ctrl) {
      const lower = result.toLowerCase();
      const code = lower.charCodeAt(0);
      // a-z -> 1-26
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
    }

    if (modifiers.alt || modifiers.meta) {
      // Prefixa Escape para enviar Meta/Alt
      result = '\x1b' + result;
    }
    return result;
  }

  // Se já for sequência especial e Alt/Meta estiver armado
  if (modifiers.alt || modifiers.meta) {
    result = '\x1b' + result;
  }

  return result;
}

/**
 * Converte uma representação lógica de step (ex: "ctrl+p", "alt+x", "d", "enter") em sequência
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
    if (mods.alt || mods.meta) {
      seq = '\x1b' + seq;
    }
    return seq;
  }

  return encodeKeyWithModifiers(mainKey, mods);
}
