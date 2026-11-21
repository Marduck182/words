import { expect, it } from 'vitest'
import { levenshtein } from './levenshtein'

it('es 0 para textos iguales y la longitud contra vacío', () => {
  expect(levenshtein('agree', 'agree')).toBe(0)
  expect(levenshtein('', 'abc')).toBe(3)
  expect(levenshtein('abc', '')).toBe(3)
})
it('cuenta inserción, borrado y sustitución como 1', () => {
  expect(levenshtein('agree', 'agre')).toBe(1)
  expect(levenshtein('agree', 'agrees')).toBe(1)
  expect(levenshtein('agree', 'agrea')).toBe(1)
})
it('suma el costo total', () => {
  expect(levenshtein('kitten', 'sitting')).toBe(3)
})
