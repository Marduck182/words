import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { Practice, type PracticeResult } from '../components/Practice'
import { Summary } from '../components/Summary'
import { api, errorMessage } from '../lib/api'
import { plural } from '../lib/format'
import type { Word } from '../lib/types'
import { useRecorder } from '../lib/useRecorder'
import { useSpeaker } from '../lib/useSpeaker'
import { useApp } from '../store'

/** Repaso de palabras difíciles; no cierra lotes, solo actualiza su estado. */
export default function HardPractice() {
  const navigate = useNavigate()
  const { settings, allWords, refresh, loadAllWords, setError } = useApp()
  const { record, markHard } = useRecorder()
  const onSpeak = useSpeaker()
  const [words, setWords] = useState<Word[] | null>(null)
  const [result, setResult] = useState<PracticeResult | null>(null)

  useEffect(() => {
    api.getHardWords().then(setWords, (e) => setError(errorMessage(e)))
  }, [setError])

  useEffect(() => {
    void loadAllWords()
  }, [loadAllWords])

  useEffect(() => {
    if (words && words.length === 0) navigate('/hard', { replace: true })
  }, [words, navigate])

  if (!words || words.length === 0) return <ErrorBanner />

  if (result) {
    const missed = words.filter((w) => result.missed.includes(w.id))
    return (
      <>
        <ErrorBanner />
        <Summary
          title="Repaso terminado"
          total={result.total}
          missed={missed}
          lead={`Practicaste ${result.total} ${plural(result.total, 'palabra', 'palabras')}. Salen de la lista al acertarlas en dos días distintos.`}
          missedTitle="Siguen en difíciles"
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/hard')}>
                Ver difíciles
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
      <Practice
        words={words}
        alreadyDone={0}
        direction={settings.direction}
        maxAttempts={settings.max_attempts}
        pool={allWords.length > 0 ? allWords : words}
        onRecord={record}
        onMarkHard={markHard}
        onSpeak={onSpeak}
        onFinish={(r) => {
          setResult(r)
          void refresh()
        }}
        onExit={() => {
          void refresh()
          navigate('/hard')
        }}
      />
    </>
  )
}
