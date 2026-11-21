import { useApp } from '../store'

export function ErrorBanner() {
  const error = useApp((s) => s.error)
  const setError = useApp((s) => s.setError)
  const refresh = useApp((s) => s.refresh)
  if (!error) return null
  return (
    <div className="banner-error" role="alert">
      <span>{error}</span>
      <span>
        <button type="button" className="btn btn-quiet" onClick={() => void refresh()}>
          Reintentar
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setError(null)}>
          Cerrar
        </button>
      </span>
    </div>
  )
}
