import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Segmented } from '../components/Segmented'
import { api, errorMessage } from '../lib/api'
import type { LotSummary } from '../lib/types'
import { useApp } from '../store'

type Filter = 'all' | 'pending' | 'done'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'done', label: 'Completos' },
]

function verb(l: LotSummary): string {
  if (l.status === 'done') return 'Repasar'
  return l.learned > 0 ? 'Continuar' : 'Empezar'
}

/** Elegir con qué lote practicar: el set troceado según las palabras por día, con su avance. */
export default function LotsPage() {
  const navigate = useNavigate()
  const wordsPerDay = useApp((s) => s.settings.words_per_day)
  const selectLot = useApp((s) => s.selectLot)
  const startRandomLot = useApp((s) => s.startRandomLot)
  const setError = useApp((s) => s.setError)
  const [lots, setLots] = useState<LotSummary[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const currentRow = useRef<HTMLLIElement>(null)

  useEffect(() => {
    api.getLotList().then(setLots, (e) => setError(errorMessage(e)))
  }, [wordsPerDay, setError])

  useEffect(() => {
    currentRow.current?.scrollIntoView?.({ block: 'center' })
  }, [lots])

  async function open(l: LotSummary) {
    if (l.status === 'done') return navigate(`/practice?review=${l.start_id}-${l.end_id}`)
    try {
      await selectLot(l.start_id, l.end_id)
      navigate('/practice')
    } catch {
      /* el error ya se muestra en el banner */
    }
  }

  async function openRandom() {
    try {
      await startRandomLot()
      navigate('/practice')
    } catch {
      /* el error ya se muestra en el banner */
    }
  }

  if (!lots) {
    return (
      <main className="page" aria-busy="true">
        <div className="skeleton" style={{ width: 240, height: 40 }} />
      </main>
    )
  }

  const visible = lots.filter((l) => (filter === 'all' ? true : filter === 'done' ? l.status === 'done' : l.status !== 'done'))

  return (
    <main className="page">
      <h1 className="lead">Elegir lote</h1>
      <p className="sub">
        Cada lote tiene {wordsPerDay} palabras (puedes cambiarlo en Ajustes). Empieza o continúa el que quieras; los lotes
        completos se pueden repasar.
      </p>

      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={() => void openRandom()}>
          Lote aleatorio
        </button>
        <Segmented label="Filtrar lotes" value={filter} options={FILTERS} onChange={setFilter} />
      </div>
      <p className="setting-help" style={{ marginTop: 8 }}>
        Lote aleatorio: {wordsPerDay} palabras al azar de las que aún no aprendes, de cualquier libro.
      </p>

      <ul className="lot-list" aria-label="Lotes">
        {visible.map((l) => (
          <li
            key={l.lot}
            ref={l.current ? currentRow : undefined}
            className="lot-row"
            data-status={l.status}
            aria-current={l.current ? 'true' : undefined}
          >
            <div className="lot-main">
              <span className="lot-name">Lote {l.lot}</span>
              <span className="lot-range">
                Palabras {l.start_id} a {l.end_id}
                {l.book ? `, libro ${l.book}` : ''}
              </span>
            </div>
            <span className="lot-state">
              {l.current && l.status !== 'done' ? 'En curso' : l.status === 'done' ? 'Completo' : ''}
            </span>
            <span className="lot-count">{`${l.learned} de ${l.size}`}</span>
            <button
              type="button"
              className={`btn ${l.status === 'done' ? 'btn-quiet' : l.current ? 'btn-primary' : 'btn-secondary'}`}
              aria-label={`${verb(l)} lote ${l.lot}`}
              onClick={() => void open(l)}
            >
              {verb(l)}
            </button>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p className="sub">No hay lotes en este filtro.</p>}
    </main>
  )
}
