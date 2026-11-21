import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import { plural } from '../lib/format'
import type { Word } from '../lib/types'
import { useApp } from '../store'

export default function HardPage() {
  const navigate = useNavigate()
  const { refresh, setError } = useApp()
  const [words, setWords] = useState<Word[] | null>(null)

  useEffect(() => {
    api.getHardWords().then(setWords, (e) => setError(errorMessage(e)))
  }, [setError])

  async function unmark(id: number) {
    try {
      await api.setHard(id, false)
      setWords((list) => list?.filter((w) => w.id !== id) ?? null)
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (!words) {
    return (
      <main className="page" aria-busy="true">
        <div className="skeleton" style={{ width: 280, height: 40 }} />
      </main>
    )
  }

  if (words.length === 0) {
    return (
      <main className="page">
        <h1 className="lead">No tienes palabras difíciles</h1>
        <p className="sub">
          Las que falles en un lote, o marques con Ctrl+D mientras practicas, aparecerán aquí para repasarlas.
        </p>
      </main>
    )
  }

  return (
    <main className="page">
      <h1 className="lead">
        {words.length} {plural(words.length, 'palabra difícil', 'palabras difíciles')}
      </h1>
      <p className="sub">Una palabra sale de esta lista al acertarla en dos días distintos.</p>
      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/hard/practice')}>
          Repasar {words.length} {plural(words.length, 'palabra', 'palabras')}
        </button>
      </div>

      <ul className="word-list">
        {words.map((w) => (
          <li key={w.id}>
            <span className="en">{w.word}</span>
            <span className="es">{w.translation}</span>
            <button type="button" className="btn btn-quiet" onClick={() => void unmark(w.id)} aria-label={`Quitar ${w.word} de difíciles`}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
