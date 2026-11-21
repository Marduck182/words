import { beforeEach, describe, expect, it } from 'vitest'
import { hasEnglishVoice, loadVoices, pickEnglishVoice, speak, type SynthLike, type VoiceLike } from './tts'

const voice = (lang: string, over: Partial<VoiceLike> = {}): VoiceLike => ({ name: `Voz ${lang}`, lang, localService: true, ...over })

class FakeUtterance {
  voice: VoiceLike | null = null
  lang = ''
  rate = 1
  constructor(public text: string) {}
}

beforeEach(() => {
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance
})

function fakeSynth(voices: VoiceLike[]) {
  const spoken: FakeUtterance[] = []
  const order: string[] = []
  const synth: SynthLike & { setVoices(v: VoiceLike[]): void; fire(): void } = {
    getVoices: () => voices,
    speak: (u) => {
      order.push('speak')
      spoken.push(u as FakeUtterance)
    },
    cancel: () => order.push('cancel'),
    addEventListener: (_t, l) => listeners.push(l),
    removeEventListener: (_t, l) => listeners.splice(listeners.indexOf(l), 1),
    setVoices: (v) => (voices = v),
    fire: () => [...listeners].forEach((l) => l()),
  }
  const listeners: (() => void)[] = []
  return { synth, spoken, order }
}

describe('pickEnglishVoice', () => {
  it('no elige nada si no hay voces', () => {
    expect(pickEnglishVoice([])).toBeUndefined()
  })
  it('ignora las voces que no son inglesas', () => {
    expect(pickEnglishVoice([voice('es-MX'), voice('fr-FR')])).toBeUndefined()
  })
  it('prefiere en-US, luego en-GB y luego cualquier otro inglés', () => {
    expect(pickEnglishVoice([voice('en-AU'), voice('en-GB'), voice('en-US')])?.lang).toBe('en-US')
    expect(pickEnglishVoice([voice('en-AU'), voice('en-GB')])?.lang).toBe('en-GB')
    expect(pickEnglishVoice([voice('es-MX'), voice('en-AU')])?.lang).toBe('en-AU')
  })
  it('entre voces del mismo idioma prefiere la local (funciona sin internet)', () => {
    const remote = voice('en-US', { name: 'En línea', localService: false })
    const local = voice('en-US', { name: 'Local', localService: true })
    expect(pickEnglishVoice([remote, local])?.name).toBe('Local')
  })
  it('acepta guion bajo y mayúsculas en el código de idioma', () => {
    expect(pickEnglishVoice([voice('EN_us')])).toBeDefined()
  })
})

describe('speak', () => {
  it('no hace nada y avisa si no hay sintetizador', () => {
    expect(speak('agree', { synth: undefined })).toBe(false)
  })
  it('no habla si no hay una voz en inglés: leer "agree" con voz en español enseñaría mal', () => {
    const { synth, spoken } = fakeSynth([voice('es-MX')])
    expect(speak('agree', { synth })).toBe(false)
    expect(spoken).toHaveLength(0)
  })
  it('corta lo que sonaba y pronuncia con la voz y el idioma elegidos', () => {
    const { synth, spoken, order } = fakeSynth([voice('es-MX'), voice('en-GB'), voice('en-US')])
    expect(speak('agree', { synth })).toBe(true)
    expect(order).toEqual(['cancel', 'speak'])
    expect(spoken[0].text).toBe('agree')
    expect(spoken[0].voice?.lang).toBe('en-US')
    expect(spoken[0].lang).toBe('en-US')
    expect(spoken[0].rate).toBe(0.9)
  })
  it('permite cambiar la velocidad', () => {
    const { synth, spoken } = fakeSynth([voice('en-US')])
    speak('agree', { synth, rate: 0.7 })
    expect(spoken[0].rate).toBe(0.7)
  })
  it('un texto vacío no se pronuncia', () => {
    const { synth, spoken } = fakeSynth([voice('en-US')])
    expect(speak('   ', { synth })).toBe(false)
    expect(spoken).toHaveLength(0)
  })
})

describe('loadVoices y hasEnglishVoice', () => {
  it('devuelve las voces enseguida si ya están cargadas', async () => {
    const { synth } = fakeSynth([voice('en-US')])
    expect(await loadVoices(synth)).toHaveLength(1)
  })
  it('espera el evento voiceschanged cuando la lista aún está vacía', async () => {
    const f = fakeSynth([])
    const pending = loadVoices(f.synth, 1000)
    f.synth.setVoices([voice('en-US')])
    f.synth.fire()
    expect(await pending).toHaveLength(1)
  })
  it('se rinde con una lista vacía si el evento nunca llega', async () => {
    const { synth } = fakeSynth([])
    expect(await loadVoices(synth, 20)).toEqual([])
  })
  it('hasEnglishVoice dice si hay una voz en inglés disponible', async () => {
    expect(await hasEnglishVoice(fakeSynth([voice('en-US')]).synth)).toBe(true)
    expect(await hasEnglishVoice(fakeSynth([voice('es-MX')]).synth)).toBe(false)
    expect(await hasEnglishVoice(undefined)).toBe(false)
  })
})
