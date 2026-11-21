import { describe, expect, it } from 'vitest'
import { normalize, stripLeading } from './normalize'

describe('normalize', () => {
  it('quita acentos, mayúsculas y espacios sobrantes', () => {
    expect(normalize('  FÁBRICA  ')).toBe('fabrica')
  })
  it('trata la ñ como n', () => {
    expect(normalize('Año')).toBe('ano')
  })
  it('ignora puntuación y signos de apertura', () => {
    expect(normalize('¿Qué?')).toBe('que')
    expect(normalize('figure-out!')).toBe('figure out')
  })
  it('colapsa espacios internos', () => {
    expect(normalize('dióxido   de  carbono')).toBe('dioxido de carbono')
  })
})

describe('stripLeading', () => {
  it('quita un artículo español al inicio', () => {
    expect(stripLeading('el tesoro', 'es')).toBe('tesoro')
    expect(stripLeading('una casa', 'es')).toBe('casa')
    expect(stripLeading('las gafas', 'es')).toBe('gafas')
  })
  it('no toca una palabra que solo empieza igual que un artículo', () => {
    expect(stripLeading('elefante', 'es')).toBe('elefante')
    expect(stripLeading('unidad', 'es')).toBe('unidad')
  })
  it('quita el "to" de los verbos en inglés', () => {
    expect(stripLeading('to agree', 'en')).toBe('agree')
  })
  it('no toca palabras inglesas que empiezan con "to"', () => {
    expect(stripLeading('tool', 'en')).toBe('tool')
    expect(stripLeading('to', 'en')).toBe('to')
  })
})
