import { describe, expect, it } from 'vitest'
import { checkAnswer } from './check'
import type { Word } from './types'

const w = (id: number, word: string, translation: string): Word => ({
  id,
  word,
  translation,
  ipa: null,
  example_en: null,
  example_es: null,
  book: 1,
})
const agree = w(1, 'agree', 'Aceptar, Acordar')
const factory = w(2, 'factory', 'Fábrica')
const bit = w(3, 'bit', 'Un poco')
const co2 = w(4, 'carbon dioxide', 'Dióxido de carbono')
const acute = w(5, 'acute', 'Agudo')
const sharp = w(6, 'sharp', 'Agudo')

describe('es → en (escribir la palabra en inglés)', () => {
  it('acepta la palabra exacta', () => {
    expect(checkAnswer('agree', agree, 'es_en')).toBe('correct')
  })
  it('ignora mayúsculas y espacios', () => {
    expect(checkAnswer('  AGREE ', agree, 'es_en')).toBe('correct')
  })
  it('acepta el verbo con "to"', () => {
    expect(checkAnswer('to agree', agree, 'es_en')).toBe('correct')
  })
  it('acepta una expresión de varias palabras', () => {
    expect(checkAnswer('Carbon  Dioxide', co2, 'es_en')).toBe('correct')
  })
  it('una letra mal en palabra larga es "casi"', () => {
    expect(checkAnswer('agrea', agree, 'es_en')).toBe('almost')
  })
  it('una letra mal en palabra de 3 letras es error', () => {
    expect(checkAnswer('bot', bit, 'es_en')).toBe('wrong')
  })
  it('otra palabra es error', () => {
    expect(checkAnswer('xyz', agree, 'es_en')).toBe('wrong')
  })
  it('una respuesta vacía es error', () => {
    expect(checkAnswer('   ', agree, 'es_en')).toBe('wrong')
  })
  it('detecta un sinónimo del mismo set con la misma traducción', () => {
    expect(checkAnswer('sharp', acute, 'es_en', [acute, sharp, agree])).toBe('synonym')
  })
  it('sin el sinónimo en el set, es error', () => {
    expect(checkAnswer('sharp', acute, 'es_en', [acute, agree])).toBe('wrong')
  })
  it('una palabra del set con otra traducción no es sinónimo', () => {
    expect(checkAnswer('factory', acute, 'es_en', [acute, factory])).toBe('wrong')
  })
})

describe('en → es (escribir la traducción)', () => {
  it('acepta cualquiera de las variantes separadas por coma', () => {
    expect(checkAnswer('aceptar', agree, 'en_es')).toBe('correct')
    expect(checkAnswer('acordar', agree, 'en_es')).toBe('correct')
  })
  it('acepta varias variantes escritas juntas, por ejemplo al copiar la respuesta mostrada', () => {
    expect(checkAnswer('Aceptar, Acordar', agree, 'en_es')).toBe('correct')
    expect(checkAnswer('acordar; aceptar', agree, 'en_es')).toBe('correct')
  })
  it('rechaza una lista donde alguna parte no es una variante', () => {
    expect(checkAnswer('aceptar, xyz', agree, 'en_es')).toBe('wrong')
  })
  it('ignora acentos', () => {
    expect(checkAnswer('fabrica', factory, 'en_es')).toBe('correct')
    expect(checkAnswer('dioxido de carbono', co2, 'en_es')).toBe('correct')
  })
  it('ignora artículos en la respuesta y en la traducción', () => {
    expect(checkAnswer('la fábrica', factory, 'en_es')).toBe('correct')
    expect(checkAnswer('un poco', bit, 'en_es')).toBe('correct')
    expect(checkAnswer('poco', bit, 'en_es')).toBe('correct')
  })
  it('un error de dedo es "casi"', () => {
    expect(checkAnswer('acepter', agree, 'en_es')).toBe('almost')
  })
  it('la palabra en inglés no vale como traducción', () => {
    expect(checkAnswer('agree', agree, 'en_es')).toBe('wrong')
  })
  it('no hay sinónimos en esta dirección', () => {
    expect(checkAnswer('agudo', acute, 'en_es', [acute, sharp])).toBe('correct')
    expect(checkAnswer('sharp', acute, 'en_es', [acute, sharp])).toBe('wrong')
  })
})
