import { useCallback } from 'react'
import { useApp } from '../store'
import { api, errorMessage } from './api'

/** Guarda respuestas sin bloquear la práctica; si falla, lo avisa en el banner. */
export function useRecorder() {
  const setError = useApp((s) => s.setError)
  const record = useCallback(
    (wordId: number, correct: boolean) => {
      api.recordAnswer(wordId, correct).catch((e) => setError(`No se pudo guardar el progreso: ${errorMessage(e)}`))
    },
    [setError],
  )
  const markHard = useCallback(
    (wordId: number) => {
      api.setHard(wordId, true).catch((e) => setError(`No se pudo marcar la palabra: ${errorMessage(e)}`))
    },
    [setError],
  )
  return { record, markHard }
}
