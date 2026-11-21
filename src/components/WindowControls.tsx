import { api } from '../lib/api'
import { CrossIcon } from './icons'

/** Botón de cerrar de la ventana sin bordes: la esconde y la app sigue en la bandeja. */
export function WindowControls() {
  return (
    <button
      type="button"
      className="btn btn-quiet window-close"
      aria-label="Ocultar ventana"
      title="Ocultar (la app sigue en la bandeja)"
      onClick={() => void api.hideWindow()}
    >
      <CrossIcon />
    </button>
  )
}
