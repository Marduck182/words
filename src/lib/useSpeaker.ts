import { useCallback } from 'react'
import { useApp } from '../store'
import { speak } from './tts'

/** Pronuncia una palabra en inglés si el ajuste está activado. Sin voz en inglés no hace nada. */
export function useSpeaker() {
  const enabled = useApp((s) => s.settings.speak)
  return useCallback(
    (word: string) => {
      if (enabled) speak(word)
    },
    [enabled],
  )
}
