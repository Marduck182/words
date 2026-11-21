import type { Direction, DirectionSetting, Verdict, Word } from './types'

export interface Card {
  word: Word
  direction: Direction
}

/** La última tarjeta que salió del frente de la cola. `counted`: sumó al avance (se acertó). */
interface Last {
  card: Card
  counted: boolean
}

export interface Session {
  /** La tarjeta actual es la primera. */
  queue: Card[]
  /** Palabras del lote, incluidas las que ya estaban aprendidas al abrir la sesión. */
  total: number
  /** Palabras acertadas al menos una vez. */
  done: number
  /** Ya se usó el reintento gratis ("casi") en la tarjeta actual. */
  retry: boolean
  /** Intentos fallados en la tarjeta actual. */
  tries: number
  /** Intentos permitidos por palabra antes de mostrar la respuesta. */
  maxAttempts: number
  /** Para "volver a la anterior" y "marcar la anterior como difícil". */
  last: Last | null
}

export interface AnswerResult {
  session: Session
  /** true/false: hay que llamar record_answer con ese valor; null: no se registra. */
  record: boolean | null
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function createSession(
  words: Word[],
  setting: DirectionSetting,
  opts: { alreadyDone?: number; rand?: () => number; maxAttempts?: number } = {},
): Session {
  const rand = opts.rand ?? Math.random
  const alreadyDone = opts.alreadyDone ?? 0
  const direction = (): Direction => (setting === 'mixed' ? (rand() < 0.5 ? 'es_en' : 'en_es') : setting)
  return {
    queue: shuffled(words, rand).map((word) => ({ word, direction: direction() })),
    total: words.length + alreadyDone,
    done: alreadyDone,
    retry: false,
    tries: 0,
    maxAttempts: Math.max(1, opts.maxAttempts ?? 3),
    last: null,
  }
}

/**
 * Aplica el resultado de un intento. Un acierto cierra la tarjeta. Un error gasta un intento; al agotar
 * los intentos se registra UN fallo y la tarjeta vuelve al final de la cola. "Casi" da un reintento
 * gratis por tarjeta y un sinónimo nunca gasta intentos.
 */
export function answer(session: Session, verdict: Verdict): AnswerResult {
  const [current, ...rest] = session.queue
  if (!current) return { session, record: null }

  if (verdict === 'correct') {
    const next = { ...session, queue: rest, done: session.done + 1, retry: false, tries: 0, last: { card: current, counted: true } }
    return { session: next, record: true }
  }
  if (verdict === 'synonym') return { session, record: null }
  if (verdict === 'almost' && !session.retry) return { session: { ...session, retry: true }, record: null }

  const tries = session.tries + 1
  if (tries >= session.maxAttempts) {
    const next = { ...session, queue: [...rest, current], retry: false, tries: 0, last: { card: current, counted: false } }
    return { session: next, record: false }
  }
  return { session: { ...session, retry: false, tries }, record: null }
}

/** Pasa la tarjeta actual al final de la cola sin registrar nada. */
export function skip(session: Session): Session {
  const [current, ...rest] = session.queue
  if (!current) return session
  return { ...session, queue: [...rest, current], retry: false, tries: 0, last: { card: current, counted: false } }
}

/** Trae al frente la tarjeta anterior (acertada, fallada o saltada). Solo se puede volver una vez seguida. */
export function goBack(session: Session): Session {
  if (!session.last) return session
  const { card, counted } = session.last
  return {
    ...session,
    queue: [card, ...session.queue.filter((c) => c.word.id !== card.word.id)],
    done: counted ? session.done - 1 : session.done,
    retry: false,
    tries: 0,
    last: null,
  }
}

/** La palabra de la tarjeta anterior, para marcarla como difícil. */
export function previousWord(session: Session): Word | null {
  return session.last?.card.word ?? null
}

export function isFinished(session: Session): boolean {
  return session.queue.length === 0
}
