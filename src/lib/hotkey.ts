export interface KeyLike {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const NAMED_KEYS = new Set([
  'Space',
  'Enter',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
])

/** El nombre de la tecla en la sintaxis del atajo global, o null si no se admite (modificadores, Escape...). */
function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]
  if (/^F([1-9]|1\d|2[0-4])$/.test(code) || NAMED_KEYS.has(code)) return code
  return null
}

/**
 * Convierte una pulsación en un atajo ("Control+Alt+W"). Devuelve null mientras solo haya modificadores,
 * si no hay ningún modificador (no se secuestran teclas sueltas) o si la tecla no se admite.
 */
export function eventToAccelerator(e: KeyLike): string | null {
  const key = keyName(e.code)
  if (!key) return null
  const modifiers = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(
    (m): m is string => !!m,
  )
  return modifiers.length === 0 ? null : [...modifiers, key].join('+')
}

const READABLE: Record<string, string> = { Control: 'Ctrl', Shift: 'Mayús', Super: 'Win', Space: 'Espacio' }

/** "Control+Alt+W" → ["Ctrl", "Alt", "W"], para mostrarlo como teclas. */
export function acceleratorParts(accelerator: string): string[] {
  return accelerator.split('+').map((p) => READABLE[p] ?? p)
}
