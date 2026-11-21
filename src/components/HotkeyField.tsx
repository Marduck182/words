import { useEffect, useState } from 'react'
import { errorMessage } from '../lib/api'
import { acceleratorParts, eventToAccelerator } from '../lib/hotkey'

interface Props {
  value: string
  onSave: (accelerator: string) => Promise<void>
  /** Aviso si el atajo guardado no se pudo registrar (otra app lo usa). */
  warning?: boolean
}

/** Muestra el atajo global y deja grabar otro pulsando la combinación. Escape cancela. */
export function HotkeyField({ value, onSave, warning }: Props) {
  const [recording, setRecording] = useState(false)
  const [candidate, setCandidate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!recording) return
    // En captura y deteniendo la propagación: mientras se graba, ni Escape ni las demás teclas
    // llegan al resto de la app (por ejemplo, "Esc oculta la ventana").
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.code === 'Escape') {
        setRecording(false)
        setCandidate(null)
        setError(null)
        return
      }
      const accelerator = eventToAccelerator(e)
      if (accelerator) setCandidate(accelerator)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  async function save() {
    if (!candidate) return
    setSaving(true)
    try {
      await onSave(candidate)
      setRecording(false)
      setCandidate(null)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const shown = recording ? candidate : value

  return (
    <div className="hotkey">
      <div className="hotkey-keys" aria-label="Atajo">
        {shown ? (
          acceleratorParts(shown).map((part, i) => <kbd key={i}>{part}</kbd>)
        ) : (
          <span className="setting-help">Pulsa la nueva combinación</span>
        )}
      </div>

      <div className="hotkey-actions">
        {recording ? (
          <>
            <button type="button" className="btn btn-primary" disabled={!candidate || saving} onClick={() => void save()}>
              Guardar atajo
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setRecording(false)
                setCandidate(null)
                setError(null)
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setRecording(true)}>
            Cambiar atajo
          </button>
        )}
      </div>

      {recording && !candidate && <p className="setting-help">Pulsa Ctrl, Alt o Mayús junto con una tecla. Esc cancela.</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {warning && !recording && (
        <p className="field-error" role="alert">
          Otra aplicación ya usa este atajo. Elige otro para poder abrir Words con el teclado.
        </p>
      )}
    </div>
  )
}
