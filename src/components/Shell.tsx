import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../store'
import { ErrorBanner } from './ErrorBanner'
import { ThemeToggle } from './ThemeToggle'
import { WindowControls } from './WindowControls'

/** Las pantallas de navegación; el número es su atajo de teclado. */
const SCREENS = [
  { to: '/', label: 'Hoy', end: true },
  { to: '/lots', label: 'Lotes' },
  { to: '/hard', label: 'Difíciles' },
  { to: '/settings', label: 'Ajustes' },
]

const isTyping = (el: Element | null) =>
  !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || (el as HTMLElement).isContentEditable)

/** Barra superior arrastrable + navegación + contenido con scroll. Las pantallas de práctica van fuera. */
export function Shell() {
  const hardCount = useApp((s) => s.hardCount)
  const navigate = useNavigate()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc esconde la ventana desde aquí (la práctica usa Esc para salir de ella).
      if (e.key === 'Escape') return void api.hideWindow()

      // 1 a 4 navegan solo si no estás escribiendo; Alt+1 a 4 funcionan siempre. Con Ctrl, Mayús o
      // Win no se hace nada, para no pisar atajos del sistema.
      const index = ['1', '2', '3', '4'].indexOf(e.key)
      if (index < 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.altKey || !isTyping(document.activeElement)) {
        e.preventDefault()
        navigate(SCREENS[index].to)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <>
      <header className="topbar" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          Words
        </span>
        <nav className="nav" aria-label="Principal">
          {SCREENS.map((s, i) => (
            <NavLink key={s.to} to={s.to} end={s.end} aria-keyshortcuts={String(i + 1)} title={`${s.label} (${i + 1})`}>
              {s.label}
              {s.to === '/hard' && hardCount > 0 && <span className="badge">{hardCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-end" data-tauri-drag-region>
          <ThemeToggle />
          <WindowControls />
        </div>
      </header>
      <ErrorBanner />
      <div className="scroll">
        <Outlet />
      </div>
    </>
  )
}
