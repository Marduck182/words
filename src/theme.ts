import type { Skin, ThemeSetting } from './lib/types'

const SKIN_KEY = 'words.skin'

export function loadSkin(): Skin {
  // Solo desarrollo: ?skin=cuaderno permite ver cada estilo sin tocar los ajustes.
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(window.location.search).get('skin')
    if (q === 'foco' || q === 'cuaderno') return q
  }
  try {
    return localStorage.getItem(SKIN_KEY) === 'cuaderno' ? 'cuaderno' : 'foco'
  } catch {
    return 'foco'
  }
}

export function saveSkin(skin: Skin) {
  try {
    localStorage.setItem(SKIN_KEY, skin)
  } catch {
    /* sin almacenamiento: el estilo vale solo para esta sesión */
  }
}

const dark = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Escribe el estilo y el tema resuelto en <html>; los tokens de index.css hacen el resto. */
export function applyAppearance(skin: Skin, theme: ThemeSetting) {
  const root = document.documentElement
  root.dataset.skin = skin
  root.dataset.theme = theme === 'system' ? (dark().matches ? 'dark' : 'light') : theme
}

/** Reaplica el tema cuando el sistema cambia, solo si se eligió "Sistema". */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = dark()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
