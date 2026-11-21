import { expect, it } from 'vitest'
import { buildHint } from './hint'

it('muestra las primeras letras y oculta el resto', () => {
  expect(buildHint('agree', 1)).toEqual(['a', '', '', '', ''])
  expect(buildHint('agree', 2)).toEqual(['a', 'g', '', '', ''])
})
it('sin pistas todo queda oculto', () => {
  expect(buildHint('go', 0)).toEqual(['', ''])
})
it('conserva los espacios y no los cuenta como letras reveladas', () => {
  expect(buildHint('vice versa', 2)).toEqual(['v', 'i', '', '', ' ', '', '', '', '', ''])
})
it('nunca revela la palabra completa', () => {
  expect(buildHint('go', 5)).toEqual(['g', ''])
})
