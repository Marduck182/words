import { useCallback, useEffect, useRef, useState } from 'react'
import { checkAnswer } from '../lib/check'
import { maskSentence } from '../lib/cloze'
import { loadFlag, saveFlag } from '../lib/prefs'
import { buildHint } from '../lib/hint'
import { answer, createSession, goBack, isFinished, previousWord, skip, type Card } from '../lib/session'
import type { DirectionSetting, Word } from '../lib/types'
import { AlertIcon, ArrowLeftIcon, CheckIcon, CrossIcon, FlagIcon } from './icons'
import { WindowControls } from './WindowControls'

export interface PracticeResult {
  /** Ids de las palabras que se fallaron al menos una vez en esta sesión. */
  missed: number[]
  total: number
}

export interface PracticeProps {
  /** Palabras pendientes de acertar. */
  words: Word[]
  /** Palabras del lote que ya estaban aprendidas al abrir la sesión. */
  alreadyDone: number
  direction: DirectionSetting
  /** Palabras entre las que buscar sinónimos. */
  pool: Word[]
  onRecord: (wordId: number, correct: boolean) => void
  onMarkHard: (wordId: number) => void
  onFinish: (result: PracticeResult) => void
  onExit: () => void
  /** Intentos por palabra antes de mostrar la respuesta (por defecto 3). */
  maxAttempts?: number
  /** Cuánto se muestra el acierto antes de pasar a la siguiente (0 = sin pausa). */
  flashMs?: number
  /** Pronuncia una palabra en inglés con la voz del sistema. Opcional: sin ella no hay sonido. */
  onSpeak?: (word: string) => void
  rand?: () => number
}

/** Los atajos que se muestran al pie. Los esenciales siempre; el resto, al pulsar "Más atajos". */
const SHORTCUTS: { keys: string[]; label: string; essential?: boolean }[] = [
  { keys: ['Enter'], label: 'Comprobar', essential: true },
  { keys: ['Alt', 'P'], label: 'Pista' },
  { keys: ['Alt', 'C'], label: 'Contexto' },
  { keys: ['Ctrl', 'Espacio'], label: 'Pronunciar' },
  { keys: ['Ctrl', '←'], label: 'Anterior' },
  { keys: ['Ctrl', '→'], label: 'Saltar' },
  { keys: ['Ctrl', 'D'], label: 'Marcar difícil' },
  { keys: ['Ctrl', 'Mayús', 'D'], label: 'Anterior difícil' },
  { keys: ['Esc'], label: 'Salir', essential: true },
]
const KEYS_OPEN = 'words.keysOpen'

type Note = { kind: 'almost' | 'synonym' | 'retry' | 'copy' | 'hard'; text: string }

/** Lo que hay que escribir: la palabra en inglés o la primera variante de la traducción. */
function expectedText(card: Card): string {
  return card.direction === 'es_en' ? card.word.word : card.word.translation.split(/[,;/]/)[0].trim()
}

export function Practice(props: PracticeProps) {
  const { pool, onRecord, onMarkHard, onFinish, onExit, onSpeak, flashMs = 600 } = props
  const [session, setSession] = useState(() =>
    createSession(props.words, props.direction, {
      alreadyDone: props.alreadyDone,
      rand: props.rand,
      maxAttempts: props.maxAttempts,
    }),
  )
  const [value, setValue] = useState('')
  const [note, setNote] = useState<Note | null>(null)
  const [reveal, setReveal] = useState<Card | null>(null) // tarjeta fallada: hay que reescribirla
  const [flash, setFlash] = useState<Card | null>(null) // acierto que se muestra un instante
  const [hint, setHint] = useState(0)
  const [context, setContext] = useState(false) // oración con hueco visible
  const lastSpoken = useRef<string | null>(null)
  const [keysOpen, setKeysOpen] = useState(() => loadFlag(KEYS_OPEN))
  const missed = useRef(new Set<number>())
  const finished = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const shown: Card | undefined = reveal ?? flash ?? session.queue[0]

  // La oración en inglés con la palabra oculta, solo en español → inglés y mientras se pregunta. Si la
  // palabra no se puede ocultar (forma irregular), es null y no se ofrece la pista: sería regalar la respuesta.
  const sentence = shown && shown.direction === 'es_en' && !reveal && !flash ? shown.word.example_en : null
  const maskedContext = sentence && shown ? maskSentence(sentence, shown.word.word) : null

  const say = (word: string) => {
    lastSpoken.current = word
    onSpeak?.(word)
  }

  const clearField = useCallback(() => {
    setValue('')
    setHint(0)
    setNote(null)
    setContext(false)
  }, [])

  const endFlash = useCallback(() => {
    setFlash(null)
    clearField()
  }, [clearField])

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(endFlash, flashMs)
    return () => window.clearTimeout(timer)
  }, [flash, flashMs, endFlash])

  useEffect(() => {
    if (isFinished(session) && !reveal && !flash && !finished.current) {
      finished.current = true
      onFinish({ missed: [...missed.current], total: session.total })
    }
  }, [session, reveal, flash, onFinish])

  useEffect(() => {
    inputRef.current?.focus()
  }, [shown, reveal])

  function submit() {
    if (flash) return endFlash()
    if (!value.trim()) return

    if (reveal) {
      if (checkAnswer(value, reveal.word, reveal.direction) === 'correct') {
        setReveal(null)
        clearField()
      } else {
        setValue('')
        setNote({ kind: 'copy', text: 'Escríbela tal como aparece arriba para continuar.' })
      }
      return
    }

    const card = session.queue[0]
    if (!card) return
    const verdict = checkAnswer(value, card.word, card.direction, pool)
    const result = answer(session, verdict)
    setSession(result.session)
    if (result.record !== null) onRecord(card.word.id, result.record)

    if (result.record === true) {
      say(card.word.word)
      if (flashMs > 0) setFlash(card)
      else clearField()
    } else if (result.record === false) {
      say(card.word.word)
      missed.current.add(card.word.id)
      setReveal(card)
      clearField()
    } else if (verdict === 'synonym') {
      setNote({ kind: 'synonym', text: `También vale «${value.trim()}», pero buscamos «${expectedText(card)}».` })
    } else if (result.session.tries > session.tries) {
      const left = result.session.maxAttempts - result.session.tries
      setValue('')
      setNote({ kind: 'retry', text: `Incorrecto. ${left === 1 ? 'Te queda 1 intento' : `Te quedan ${left} intentos`}.` })
    } else {
      setNote({ kind: 'almost', text: 'Casi. Revisa las letras y vuelve a intentar.' })
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase()
      if (key === 'escape') return onExit()
      if (e.ctrlKey && e.shiftKey && key === 'd') {
        // Ctrl+Mayús+D: la palabra anterior (la que acabas de dejar atrás) como difícil.
        e.preventDefault()
        const prev = previousWord(session)
        if (prev) {
          onMarkHard(prev.id)
          setNote({ kind: 'hard', text: `«${prev.word}» marcada como difícil.` })
        } else {
          setNote({ kind: 'copy', text: 'Aún no hay una palabra anterior.' })
        }
      } else if (e.ctrlKey && key === 'd' && shown) {
        e.preventDefault()
        onMarkHard(shown.word.id)
        setNote({ kind: 'hard', text: 'Marcada como difícil.' })
      } else if (e.ctrlKey && key === 'arrowleft' && !reveal && !flash) {
        e.preventDefault()
        if (previousWord(session)) {
          setSession((s) => goBack(s))
          clearField()
        } else {
          setNote({ kind: 'copy', text: 'Aún no hay una palabra anterior.' })
        }
      } else if (e.ctrlKey && key === 'arrowright' && !reveal && !flash) {
        e.preventDefault()
        setSession((s) => skip(s))
        clearField()
      } else if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        // Solo se pronuncia lo que ya se ve; en español → inglés la respuesta se oye al acertar o al revelarla.
        const visible = reveal ?? flash ?? (shown?.direction === 'en_es' ? shown : null)
        if (visible) say(visible.word.word)
        else if (lastSpoken.current) onSpeak?.(lastSpoken.current)
      } else if (e.altKey && key === 'c' && maskedContext !== null && !reveal && !flash) {
        e.preventDefault()
        setContext((c) => !c)
      } else if (e.altKey && key === 'p' && !reveal && !flash) {
        e.preventDefault()
        setHint((h) => h + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, reveal, flash, session, maskedContext, onExit, onMarkHard, onSpeak, clearField])

  if (!shown) return null

  const toEnglish = shown.direction === 'es_en'
  const promptText = toEnglish ? shown.word.translation : shown.word.word
  const sourceExample = toEnglish ? shown.word.example_es : shown.word.example_en
  const state = flash ? 'correct' : reveal ? 'wrong' : note?.kind === 'almost' ? 'almost' : 'idle'
  const hintCells = hint > 0 && !reveal && !flash ? buildHint(expectedText(shown), hint) : null

  return (
    <section className="practice" aria-label="Práctica">
      <header className="practice-top" data-tauri-drag-region>
        <button type="button" className="btn btn-quiet" onClick={onExit}>
          <ArrowLeftIcon /> Salir
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={session.total} aria-valuenow={session.done}>
          <div className="progress-fill" style={{ transform: `scaleX(${session.done / Math.max(session.total, 1)})` }} />
        </div>
        <span className="progress-count">{`${session.done} / ${session.total}`}</span>
        <WindowControls />
      </header>

      <div className="practice-main">
        <p className="prompt-label">{toEnglish ? 'Escribe en inglés' : 'Escribe en español'}</p>
        <h1 className="prompt-word" lang={toEnglish ? 'es' : 'en'}>
          {promptText}
        </h1>
        {!toEnglish && shown.word.ipa && <p className="prompt-ipa">{shown.word.ipa}</p>}
        {sourceExample && !reveal && (
          <p className="prompt-example" lang={toEnglish ? 'es' : 'en'}>
            {sourceExample}
          </p>
        )}

        {maskedContext !== null && (
          <>
            <button
              type="button"
              className="btn btn-quiet context-btn"
              aria-pressed={context}
              aria-keyshortcuts="Alt+C"
              onClick={() => setContext((c) => !c)}
            >
              Ver en contexto
            </button>
            {context && (
              <p className="context" data-testid="context" lang="en">
                {maskedContext}
              </p>
            )}
          </>
        )}

        {reveal && (
          <div className="reveal" role="status">
            <p className="reveal-label">
              <CrossIcon /> Respuesta
            </p>
            <p className="reveal-answer">{toEnglish ? reveal.word.word : reveal.word.translation}</p>
            {toEnglish && reveal.word.ipa && <p className="prompt-ipa">{reveal.word.ipa}</p>}
            {reveal.word.example_en && <p className="prompt-example">{reveal.word.example_en}</p>}
          </div>
        )}

        <input
          ref={inputRef}
          className="answer-field"
          data-state={state}
          aria-label="Respuesta"
          value={value}
          readOnly={!!flash}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={reveal ? 'Escríbela para continuar' : toEnglish ? 'Palabra en inglés' : 'Traducción'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <div className="feedback" role="status" aria-live="polite">
          {flash && (
            <p className="note note-ok">
              <CheckIcon /> Correcto
            </p>
          )}
          {note && !flash && (
            <p className={`note note-${note.kind}`}>
              {note.kind === 'hard' ? <FlagIcon /> : <AlertIcon />} {note.text}
            </p>
          )}
        </div>

        {hintCells && (
          <div className="hint" data-testid="hint" aria-label="Pista">
            {hintCells.map((c, i) => (
              <span key={i} className={c === ' ' ? 'hint-gap' : 'hint-cell'}>
                {c === ' ' ? '' : c}
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="practice-foot">
        <ul className="keys" id="practice-keys" aria-label="Atajos de teclado">
          {SHORTCUTS.filter((k) => keysOpen || k.essential).map((k) => (
            <li key={k.label}>
              {k.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}{' '}
              {k.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-quiet keys-toggle"
          aria-expanded={keysOpen}
          aria-controls="practice-keys"
          onClick={() => {
            saveFlag(KEYS_OPEN, !keysOpen)
            setKeysOpen(!keysOpen)
          }}
        >
          {keysOpen ? 'Menos atajos' : 'Más atajos'}
        </button>
      </footer>
    </section>
  )
}
