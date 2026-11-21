export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
}

export interface SynthLike {
  getVoices(): VoiceLike[]
  speak(utterance: unknown): void
  cancel(): void
  addEventListener?(type: string, listener: () => void): void
  removeEventListener?(type: string, listener: () => void): void
}

const defaultSynth = (): SynthLike | undefined =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? (window.speechSynthesis as unknown as SynthLike) : undefined

const normalize = (lang: string) => lang.toLowerCase().replace('_', '-')

/**
 * La mejor voz en inglés disponible: en-US, luego en-GB, luego cualquier otro inglés; entre voces del
 * mismo idioma, la local (suena sin internet). Si no hay ninguna, undefined.
 */
export function pickEnglishVoice<T extends VoiceLike>(voices: T[]): T | undefined {
  const rank = (v: T) => {
    const lang = normalize(v.lang)
    return (lang === 'en-us' ? 0 : lang === 'en-gb' ? 1 : 2) * 2 + (v.localService === false ? 1 : 0)
  }
  return voices
    .filter((v) => {
      const lang = normalize(v.lang)
      return lang === 'en' || lang.startsWith('en-')
    })
    .sort((a, b) => rank(a) - rank(b))[0]
}

/**
 * Pronuncia `text` con una voz en inglés, cortando lo que estuviera sonando. Devuelve false (y no habla)
 * si no hay sintetizador o no hay voz en inglés: leer una palabra inglesa con una voz en español
 * enseñaría una pronunciación equivocada.
 */
export function speak(text: string, opts: { synth?: SynthLike; rate?: number } = {}): boolean {
  const synth = 'synth' in opts ? opts.synth : defaultSynth()
  const clean = text.trim()
  if (!synth || !clean) return false
  const voice = pickEnglishVoice(synth.getVoices())
  if (!voice) return false

  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.voice = voice as unknown as SpeechSynthesisVoice
  utterance.lang = voice.lang
  utterance.rate = opts.rate ?? 0.9
  synth.cancel()
  synth.speak(utterance)
  return true
}

/** Las voces del sistema. Chromium las carga tarde: si aún no hay, espera `voiceschanged` (con tope). */
export function loadVoices(synth: SynthLike | undefined = defaultSynth(), timeoutMs = 1500): Promise<VoiceLike[]> {
  if (!synth) return Promise.resolve([])
  const now = synth.getVoices()
  if (now.length > 0) return Promise.resolve(now)

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      synth.removeEventListener?.('voiceschanged', onChange)
      resolve(synth.getVoices())
    }
    const onChange = () => {
      if (synth.getVoices().length > 0) finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    synth.addEventListener?.('voiceschanged', onChange)
  })
}

export async function hasEnglishVoice(synth: SynthLike | undefined = defaultSynth()): Promise<boolean> {
  return pickEnglishVoice(await loadVoices(synth)) !== undefined
}
