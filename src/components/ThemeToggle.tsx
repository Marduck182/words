import type { ThemeSetting } from '../lib/types'
import { useApp } from '../store'
import { MonitorIcon, MoonIcon, SunIcon } from './icons'

const ORDER: ThemeSetting[] = ['system', 'light', 'dark']
const LABEL: Record<ThemeSetting, string> = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' }
const ICON = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }

/** Botón de la barra superior: avanza Sistema, Claro, Oscuro sin entrar a Ajustes. */
export function ThemeToggle() {
  const theme = useApp((s) => s.settings.theme)
  const setSetting = useApp((s) => s.setSetting)
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
  const Icon = ICON[theme]
  const label = `Tema: ${LABEL[theme]}. Cambiar a ${LABEL[next]}`

  return (
    <button
      type="button"
      className="btn btn-quiet theme-btn"
      aria-label={label}
      title={label}
      onClick={() => void setSetting('theme', next).catch(() => undefined)}
    >
      <Icon />
    </button>
  )
}
