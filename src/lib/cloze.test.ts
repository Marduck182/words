import { describe, expect, it } from 'vitest'
import { BLANK, maskSentence } from './cloze'

const mask = (sentence: string, word: string) => maskSentence(sentence, word)

describe('maskSentence', () => {
  it('oculta la palabra tal cual aparece', () => {
    expect(mask('The students agree they have too much homework.', 'agree')).toBe(
      `The students ${BLANK} they have too much homework.`,
    )
  })

  it('ignora mayúsculas y conserva la puntuación vecina', () => {
    expect(mask('Agree with me.', 'agree')).toBe(`${BLANK} with me.`)
    expect(mask('"Agree!" she said.', 'agree')).toBe(`"${BLANK}!" she said.`)
  })

  it('cubre las formas flexionadas: -s, -ed, -ing', () => {
    expect(mask('She agrees.', 'agree')).toBe(`She ${BLANK}.`)
    expect(mask('They agreed.', 'agree')).toBe(`They ${BLANK}.`)
    expect(mask('We are agreeing.', 'agree')).toBe(`We are ${BLANK}.`)
  })

  it('cubre el cambio de y por i: study, studies, studied', () => {
    expect(mask('She studies hard.', 'study')).toBe(`She ${BLANK} hard.`)
    expect(mask('He studied hard.', 'study')).toBe(`He ${BLANK} hard.`)
  })

  it('cubre la e que cae: make, making', () => {
    expect(mask('He is making tea.', 'make')).toBe(`He is ${BLANK} tea.`)
  })

  it('cubre la consonante doble: stop, stopped, stopping', () => {
    expect(mask('The car stopped.', 'stop')).toBe(`The car ${BLANK}.`)
    expect(mask('It kept stopping.', 'stop')).toBe(`It kept ${BLANK}.`)
  })

  it('cubre la c que pasa a ck: panic, panicked, mimicking', () => {
    expect(mask('Everyone panicked.', 'panic')).toBe(`Everyone ${BLANK}.`)
    expect(mask('It kept mimicking us.', 'mimic')).toBe(`It kept ${BLANK} us.`)
  })

  it('no oculta otras palabras que solo empiezan igual', () => {
    expect(mask('The actor acted well.', 'act')).toBe(`The actor ${BLANK} well.`)
  })

  it('oculta todas las apariciones', () => {
    expect(mask('Agree, then agree again.', 'agree')).toBe(`${BLANK}, then ${BLANK} again.`)
  })

  it('maneja expresiones de varias palabras flexionando la primera', () => {
    expect(mask('He figured out the answer.', 'figure out')).toBe(`He ${BLANK} the answer.`)
    expect(mask('Figure out the answer.', 'figure out')).toBe(`${BLANK} the answer.`)
  })

  it('devuelve null si la palabra no aparece, por ejemplo en formas irregulares', () => {
    expect(mask('She went home.', 'go')).toBeNull()
  })

  it('devuelve null con una oración o palabra vacías', () => {
    expect(mask('', 'agree')).toBeNull()
    expect(mask('Agree.', '')).toBeNull()
  })
})
