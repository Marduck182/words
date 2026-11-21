import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { Practice, type PracticeResult } from '../components/Practice'
import { Summary } from '../components/Summary'
import { api, errorMessage } from '../lib/api'
import { plural } from '../lib/format'
import type { LotWord } from '../lib/types'
import { useRecorder } from '../lib/useRecorder'
import { useSpeaker } from '../lib/useSpeaker'
import { useApp } from '../store'

/** Foto del lote al abrir la práctica: mientras se practica el store se recarga y no debe cambiarla. */
interface Snapshot {
  /** Número de lote abierto; 0 cuando es un repaso de un lote ya aprendido. */
  lot: number
  words: LotWord[]
  learned: number
}

type Closing = 'pending' | 'ok' | 'failed'

/** "1-50" → [1, 50]; cualquier otra cosa → null. */
function parseRange(text: string | null): [number, number] | null {
  const m = /^(\d+)-(\d+)$/.exec(text ?? '')
  return m ? [Number(m[1]), Number(m[2])] : null
}

/**
 * Práctica de un lote, fuera del marco con barra superior para dejar solo la palabra.
 * Sin parámetros practica el lote en curso; con `?review=inicio-fin` repasa ese rango (ya aprendido)
 * sin abrir ni cerrar lotes.
 */
export default function PracticePage({ flashMs }: { flashMs?: number } = {}) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const review = parseRange(search.get('review'))
  const { ready, today, settings, allWords, refresh, advance, loadAllWords, setError } = useApp()
  const goalMet = useApp((s) => s.today?.status === 'goal_met')
  const { record, markHard } = useRecorder()
  const onSpeak = useSpeaker()

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [closing, setClosing] = useState<Closing>('pending')
  const autoClosed = useRef(false)

  useEffect(() => {
    void loadAllWords()
  }, [loadAllWords])

  // Toma la foto una sola vez: del lote en curso (store) o del rango a repasar (base de datos).
  useEffect(() => {
    if (snap) return
    if (review) {
      api.getLotView(review[0], review[1]).then(
        (v) => setSnap({ lot: 0, words: v.words, learned: 0 }),
        (e) => {
          setError(errorMessage(e))
          navigate('/lots', { replace: true })
        },
      )
    } else if (ready) {
      const lot = today?.status === 'active' ? today.lot : null
      if (lot) setSnap({ lot: lot.lot, words: lot.words, learned: lot.learned })
      else navigate('/', { replace: true })
    }
  }, [snap, review, ready, today, navigate, setError])

  const close = useCallback(
    async (r: PracticeResult, lot: number) => {
      setResult(r)
      if (lot === 0) return setClosing('ok') // repaso: no hay lote que cerrar
      setClosing('pending')
      try {
        await api.completeLot(lot)
        await refresh()
        setClosing('ok')
      } catch (e) {
        setError(errorMessage(e))
        setClosing('failed')
      }
    },
    [refresh, setError],
  )

  // Un lote ya aprendido por completo (pero sin cerrar) se cierra sin pedir nada.
  useEffect(() => {
    if (!snap || snap.lot === 0 || autoClosed.current) return
    if (snap.words.every((w) => w.learned)) {
      autoClosed.current = true
      void close({ missed: [], total: snap.words.length }, snap.lot)
    }
  }, [snap, close])

  async function exit() {
    if (review) return navigate('/lots')
    await refresh() // Inicio debe mostrar lo que ya aprendiste
    navigate('/')
  }

  if (!snap) return <ErrorBanner />

  if (result) {
    if (closing === 'pending') return null
    const missed = snap.words.filter((w) => result.missed.includes(w.id))
    const reviewing = snap.lot === 0

    if (closing === 'failed') {
      return (
        <>
          <ErrorBanner />
          <Summary
            title="No se pudo cerrar el lote"
            total={result.total}
            missed={missed}
            lead="Tus respuestas están guardadas. Vuelve a intentar cerrarlo."
            actions={
              <>
                <button type="button" className="btn btn-primary" onClick={() => void close(result, snap.lot)}>
                  Reintentar
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
                  Volver al inicio
                </button>
              </>
            }
          />
        </>
      )
    }

    return (
      <>
        <ErrorBanner />
        <Summary
          title={reviewing ? 'Repaso terminado' : 'Lote completo'}
          total={result.total}
          missed={missed}
          lead={
            reviewing
              ? `Repasaste ${result.total} ${plural(result.total, 'palabra', 'palabras')}. Las que fallaste quedaron en difíciles.`
              : undefined
          }
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate(reviewing ? '/lots' : '/')}>
                {reviewing ? 'Volver a los lotes' : 'Volver al inicio'}
              </button>
              {!reviewing && goalMet && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    await advance()
                    setSnap(null)
                    setResult(null)
                    autoClosed.current = false
                  }}
                >
                  Adelantar siguiente lote
                </button>
              )}
            </>
          }
        />
      </>
    )
  }

  // En un repaso se practican todas las palabras; en un lote, solo las que faltan.
  const reviewing = snap.lot === 0
  const pending = reviewing ? snap.words : snap.words.filter((w) => !w.learned)
  if (pending.length === 0) return <ErrorBanner />

  return (
    <>
      <ErrorBanner />
      <Practice
        key={`${snap.lot}-${snap.words[0]?.id}`}
        words={pending}
        alreadyDone={reviewing ? 0 : snap.learned}
        direction={settings.direction}
        maxAttempts={settings.max_attempts}
        flashMs={flashMs}
        pool={allWords.length > 0 ? allWords : snap.words}
        onRecord={record}
        onMarkHard={markHard}
        onSpeak={onSpeak}
        onFinish={(r) => void close(r, snap.lot)}
        onExit={() => void exit()}
      />
    </>
  )
}
