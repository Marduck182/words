import { levenshtein } from './levenshtein'
import { normalize, stripLeading } from './normalize'
import type { Direction, Verdict, Word } from './types'

type Lang = 'es' | 'en'

function comparable(text: string, lang: Lang): string {
  return stripLeading(normalize(text), lang)
}

function translationVariants(word: Word): string[] {
  return word.translation
    .split(/[,;/]/)
    .map((v) => comparable(v, 'es'))
    .filter(Boolean)
}

/** Varias variantes juntas ("aceptar, acordar"): vale si cada parte es una variante. */
function isVariantList(input: string, targets: string[]): boolean {
  const parts = input
    .split(/[,;/]/)
    .map((p) => comparable(p, 'es'))
    .filter(Boolean)
  return parts.length > 1 && parts.every((p) => targets.includes(p))
}

/** Un error de dedo: 1 letra en palabras de 4 a 8, 2 letras en palabras de 9 o más. */
function isTypo(typed: string, target: string): boolean {
  if (target.length < 4) return false
  return levenshtein(typed, target) <= (target.length >= 9 ? 2 : 1)
}

/** Otra palabra del set con la misma traducción que `word` y que coincide con lo escrito. */
function isSynonym(typed: string, word: Word, pool: Word[]): boolean {
  const mine = new Set(translationVariants(word))
  return pool.some(
    (p) => p.id !== word.id && comparable(p.word, 'en') === typed && translationVariants(p).some((v) => mine.has(v)),
  )
}

/**
 * Evalúa lo escrito. `es_en` pide la palabra en inglés; `en_es` pide la traducción
 * (cualquiera de sus variantes). Ignora acentos, mayúsculas, puntuación y artículos.
 * `pool` permite reconocer sinónimos del mismo set en `es_en`.
 */
export function checkAnswer(input: string, word: Word, direction: Direction, pool: Word[] = []): Verdict {
  const lang: Lang = direction === 'es_en' ? 'en' : 'es'
  const typed = comparable(input, lang)
  if (!typed) return 'wrong'

  const targets = direction === 'es_en' ? [comparable(word.word, 'en')] : translationVariants(word)
  if (targets.includes(typed)) return 'correct'
  if (direction === 'en_es' && isVariantList(input, targets)) return 'correct'
  if (direction === 'es_en' && isSynonym(typed, word, pool)) return 'synonym'
  if (targets.some((t) => isTypo(typed, t))) return 'almost'
  return 'wrong'
}
