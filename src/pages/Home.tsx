import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Segmented } from '../components/Segmented'
import { longDate, number, plural } from '../lib/format'
import type { DirectionSetting } from '../lib/types'
import { useApp } from '../store'

const DIRECTIONS: { value: DirectionSetting; label: string }[] = [
  { value: 'es_en', label: 'Español → inglés' },
  { value: 'en_es', label: 'Inglés → español' },
  { value: 'mixed', label: 'Mixto' },
]

export default function Home() {
  const navigate = useNavigate()
  const { ready, today, stats, hardCount, settings, setSetting, advance, refresh } = useApp()

  // Al volver de practicar, Inicio debe mostrar el progreso real y no el de la última carga.
  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!ready || !today) {
    return (
      <main className="page" aria-busy="true">
        <div className="skeleton" style={{ width: 140 }} />
        <div className="skeleton" style={{ width: 360, height: 40, marginTop: 16 }} />
        <div className="skeleton" style={{ width: 280, marginTop: 20 }} />
      </main>
    )
  }

  const lot = today.lot
  const remaining = lot ? lot.size - lot.learned : 0
  const started = !!lot && lot.learned > 0

  return (
    <main className="page">
      <p className="date">{longDate()}</p>

      {today.status === 'active' && lot && (
        <>
          <h1 className="lead">
            {started
              ? `Te ${plural(remaining, 'falta', 'faltan')} ${remaining} ${plural(remaining, 'palabra', 'palabras')}`
              : `Hoy aprenderás ${lot.size} ${plural(lot.size, 'palabra', 'palabras')}`}
          </h1>
          <p className="sub">
            {lot.random ? 'Lote aleatorio' : `Lote ${lot.lot}`}. Escribe cada palabra; las que falles vuelven hasta que las aciertes.
          </p>

          <div className="lot-progress">
            <div className="progress" role="progressbar" aria-label="Progreso del lote" aria-valuemin={0} aria-valuemax={lot.size} aria-valuenow={lot.learned}>
              <div className="progress-fill" style={{ transform: `scaleX(${lot.learned / Math.max(lot.size, 1)})` }} />
            </div>
            <span className="progress-count">{`${lot.learned} de ${lot.size}`}</span>
          </div>

          <div className="controls">
            <Segmented
              label="Dirección de práctica"
              value={settings.direction}
              options={DIRECTIONS}
              onChange={(v) => void setSetting('direction', v)}
            />
          </div>
          <div className="controls" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/practice')}>
              {started ? 'Continuar lote' : 'Empezar lote'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/lots')}>
              Elegir lote
            </button>
            {hardCount > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/hard')}>
                Repasar difíciles ({hardCount})
              </button>
            )}
          </div>
        </>
      )}

      {today.status === 'goal_met' && (
        <>
          <h1 className="lead">Meta de hoy cumplida</h1>
          <p className="sub">
            Completaste {today.lots_completed_today} {plural(today.lots_completed_today, 'lote', 'lotes')} hoy. Vuelve mañana o adelanta el siguiente.
          </p>
          <div className="controls">
            <button type="button" className="btn btn-primary" onClick={() => void advance()}>
              Adelantar siguiente lote
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/lots')}>
              Elegir lote
            </button>
            {hardCount > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/hard')}>
                Repasar difíciles ({hardCount})
              </button>
            )}
          </div>
        </>
      )}

      {today.status === 'finished' && (
        <>
          <h1 className="lead">Terminaste las {number(stats?.total_words ?? 0)} palabras</h1>
          <p className="sub">Ya no quedan palabras nuevas. Repasa las difíciles para seguir practicando.</p>
          <div className="controls">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/hard')} disabled={hardCount === 0}>
              Repasar difíciles ({hardCount})
            </button>
          </div>
        </>
      )}

      {stats && (
        <dl className="stats">
          <div>
            <dt>Aprendidas</dt>
            <dd>
              {number(stats.learned)} de {number(stats.total_words)}
            </dd>
          </div>
          <div>
            <dt>Lotes completados</dt>
            <dd>{number(stats.lots_completed)}</dd>
          </div>
          <div>
            <dt>Aciertos</dt>
            <dd>{stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)} %`}</dd>
          </div>
        </dl>
      )}
    </main>
  )
}
