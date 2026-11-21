import { describe, expect, it } from 'vitest'
import { answer, createSession, goBack, isFinished, previousWord, skip } from './session'
import type { Word } from './types'

const w = (id: number, word: string): Word => ({
  id,
  word,
  translation: word.toUpperCase(),
  ipa: null,
  example_en: null,
  example_es: null,
  book: 1,
})
const [a, b, c] = [w(1, 'a'), w(2, 'b'), w(3, 'c')]
const KEEP_ORDER = () => 0.999 // Fisher–Yates con esto no intercambia nada
const ids = (s: { queue: { word: Word }[] }) => s.queue.map((x) => x.word.id)

// Por defecto 1 intento: el primer error ya cuenta. Los casos de varios intentos lo piden aparte.
const start = (words = [a, b, c], setting: 'es_en' | 'en_es' | 'mixed' = 'es_en', maxAttempts = 1) =>
  createSession(words, setting, { rand: KEEP_ORDER, maxAttempts })

describe('createSession', () => {
  it('pone todas las palabras en la cola y cuenta las ya aprendidas', () => {
    const s = createSession([a, b], 'es_en', { alreadyDone: 3, rand: KEEP_ORDER })
    expect(ids(s)).toEqual([1, 2])
    expect([s.total, s.done]).toEqual([5, 3])
  })
  it('mezcla el orden de la cola', () => {
    const many = Array.from({ length: 30 }, (_, i) => w(i + 1, `w${i}`))
    const s = createSession(many, 'es_en', { rand: () => 0.1 })
    expect(ids(s)).not.toEqual(many.map((x) => x.id))
    expect([...ids(s)].sort((x, y) => x - y)).toEqual(many.map((x) => x.id))
  })
  it('respeta la dirección elegida', () => {
    expect(start([a], 'es_en').queue[0].direction).toBe('es_en')
    expect(start([a], 'en_es').queue[0].direction).toBe('en_es')
  })
  it('en modo mixto sortea la dirección de cada tarjeta', () => {
    const low = createSession([a], 'mixed', { rand: () => 0.1 })
    const high = createSession([a], 'mixed', { rand: () => 0.999 })
    expect([low.queue[0].direction, high.queue[0].direction]).toEqual(['es_en', 'en_es'])
  })
})

describe('answer', () => {
  it('una respuesta correcta saca la tarjeta, suma y se registra como acierto', () => {
    const r = answer(start(), 'correct')
    expect(ids(r.session)).toEqual([2, 3])
    expect(r.session.done).toBe(1)
    expect(r.record).toBe(true)
  })
  it('un error manda la tarjeta al final, no suma y se registra como fallo', () => {
    const r = answer(start(), 'wrong')
    expect(ids(r.session)).toEqual([2, 3, 1])
    expect(r.session.done).toBe(0)
    expect(r.record).toBe(false)
  })
  it('"casi" da un reintento gratis: la tarjeta se queda y no se registra', () => {
    const r = answer(start(), 'almost')
    expect(ids(r.session)).toEqual([1, 2, 3])
    expect(r.session.retry).toBe(true)
    expect(r.record).toBeNull()
  })
  it('un segundo "casi" en la misma tarjeta cuenta como error', () => {
    const r = answer(answer(start(), 'almost').session, 'almost')
    expect(ids(r.session)).toEqual([2, 3, 1])
    expect(r.record).toBe(false)
  })
  it('un sinónimo no se registra, no cambia la cola y no gasta el reintento', () => {
    const r = answer(start(), 'synonym')
    expect(ids(r.session)).toEqual([1, 2, 3])
    expect(r.session.retry).toBe(false)
    expect(r.record).toBeNull()
  })
  it('el reintento gratis se renueva en la tarjeta siguiente', () => {
    const afterMiss = answer(answer(start(), 'almost').session, 'wrong').session
    expect(afterMiss.retry).toBe(false)
    expect(answer(afterMiss, 'almost').record).toBeNull()
  })
  it('no modifica la sesión recibida', () => {
    const s = start()
    answer(s, 'correct')
    expect(ids(s)).toEqual([1, 2, 3])
  })
})

describe('varios intentos por palabra', () => {
  const three = () => start([a, b, c], 'es_en', 3)

  it('un error con intentos de sobra deja la tarjeta, no registra y cuenta el intento', () => {
    const r = answer(three(), 'wrong')
    expect(ids(r.session)).toEqual([1, 2, 3])
    expect(r.record).toBeNull()
    expect(r.session.tries).toBe(1)
  })
  it('el último intento fallado manda la tarjeta al final y registra un solo fallo', () => {
    let s = three()
    s = answer(s, 'wrong').session
    s = answer(s, 'wrong').session
    expect(ids(s)).toEqual([1, 2, 3])
    const r = answer(s, 'wrong')
    expect(ids(r.session)).toEqual([2, 3, 1])
    expect(r.record).toBe(false)
    expect(r.session.tries).toBe(0)
  })
  it('acertar en un intento posterior se registra como acierto y reinicia los intentos', () => {
    const r = answer(answer(three(), 'wrong').session, 'correct')
    expect(r.record).toBe(true)
    expect(ids(r.session)).toEqual([2, 3])
    expect(r.session.tries).toBe(0)
  })
  it('un "casi" repetido cuenta como un intento fallado', () => {
    const r = answer(answer(three(), 'almost').session, 'almost')
    expect(r.record).toBeNull()
    expect(r.session.tries).toBe(1)
    expect(ids(r.session)).toEqual([1, 2, 3])
  })
  it('un sinónimo no gasta intentos', () => {
    expect(answer(three(), 'synonym').session.tries).toBe(0)
  })
  it('los intentos fallados no pasan a la tarjeta siguiente', () => {
    const afterMiss = answer(answer(three(), 'wrong').session, 'correct').session
    expect(answer(afterMiss, 'wrong').session.tries).toBe(1)
  })
})

describe('volver a la anterior', () => {
  it('sin tarjeta anterior no cambia nada', () => {
    const s = start()
    expect(goBack(s)).toEqual(s)
    expect(previousWord(s)).toBeNull()
  })
  it('tras un acierto, esa tarjeta vuelve al frente y resta del avance', () => {
    const s = answer(start(), 'correct').session
    expect(s.done).toBe(1)
    const back = goBack(s)
    expect(ids(back)).toEqual([1, 2, 3])
    expect(back.done).toBe(0)
  })
  it('tras fallar una palabra (que va al final) la trae al frente sin duplicarla', () => {
    const s = answer(start(), 'wrong').session
    expect(ids(s)).toEqual([2, 3, 1])
    const back = goBack(s)
    expect(ids(back)).toEqual([1, 2, 3])
    expect(back.done).toBe(0)
  })
  it('tras saltar una tarjeta la trae de vuelta al frente', () => {
    expect(ids(goBack(skip(start())))).toEqual([1, 2, 3])
  })
  it('solo vuelve una tarjeta: la anterior se consume', () => {
    const once = goBack(answer(start(), 'correct').session)
    expect(goBack(once)).toEqual(once)
    expect(previousWord(once)).toBeNull()
  })
  it('previousWord dice cuál fue la última palabra que salió del frente', () => {
    expect(previousWord(answer(start(), 'correct').session)?.id).toBe(1)
    expect(previousWord(skip(start()))?.id).toBe(1)
  })
  it('un error intermedio o un "casi" no cambian cuál fue la anterior', () => {
    const afterOne = answer(start([a, b, c], 'es_en', 3), 'correct').session
    const afterTwoMisses = answer(answer(afterOne, 'wrong').session, 'almost').session
    expect(previousWord(afterTwoMisses)?.id).toBe(1)
  })
  it('reinicia los intentos y el reintento gratis al volver', () => {
    const s = answer(answer(start([a, b], 'es_en', 3), 'correct').session, 'wrong').session
    expect(s.tries).toBe(1)
    const back = goBack(s)
    expect([back.tries, back.retry]).toEqual([0, false])
  })
})

describe('skip', () => {
  it('manda la tarjeta actual al final sin registrar nada ni sumar', () => {
    const s = skip(start())
    expect(ids(s)).toEqual([2, 3, 1])
    expect(s.done).toBe(0)
  })
  it('renueva el reintento gratis', () => {
    const s = skip(answer(start(), 'almost').session)
    expect(s.retry).toBe(false)
  })
  it('reinicia los intentos fallados', () => {
    const s = skip(answer(start([a, b], 'es_en', 3), 'wrong').session)
    expect(s.tries).toBe(0)
  })
  it('con una sola tarjeta la deja igual', () => {
    expect(ids(skip(start([a])))).toEqual([1])
  })
})

describe('isFinished', () => {
  it('termina cuando todas las palabras se acertaron, incluso las falladas antes', () => {
    let s = start([a, b])
    s = answer(s, 'wrong').session // b, a
    s = answer(s, 'correct').session // a
    expect(isFinished(s)).toBe(false)
    s = answer(s, 'correct').session
    expect(isFinished(s)).toBe(true)
    expect(s.done).toBe(2)
  })
})
