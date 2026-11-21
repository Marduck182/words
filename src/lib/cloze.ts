export const BLANK = '______'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Formas flexionadas habituales de una palabra inglesa, de la más larga a la más corta. */
function forms(token: string): string[] {
  const t = token.toLowerCase()
  const out = new Set<string>([t])
  const add = (stem: string, suffixes: string[]) => suffixes.forEach((s) => out.add(stem + s))

  add(t, ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'ers', 'est'])
  if (t.endsWith('e')) add(t.slice(0, -1), ['ing', 'ed', 'er', 'ers', 'est']) // make → making
  if (/[^aeiou]y$/.test(t)) add(t.slice(0, -1), ['ies', 'ied', 'ier', 'iest', 'ily']) // study → studies
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(t)) add(t + t.slice(-1), ['ed', 'ing', 'er', 'est']) // stop → stopped
  if (t.endsWith('c')) add(t, ['ked', 'king']) // panic → panicked
  return [...out].sort((a, b) => b.length - a.length)
}

/**
 * Oculta `word` en `sentence`, también en sus formas flexionadas (agrees, agreed, studies, stopping...).
 * En expresiones de varias palabras solo se flexiona la primera ("figure out" → "figured out").
 * Devuelve null si no aparece (por ejemplo una forma irregular como "went" para "go"): quien llama
 * no debe ofrecer la pista en ese caso, para no regalar la respuesta.
 */
export function maskSentence(sentence: string, word: string): string | null {
  const tokens = word.trim().split(/\s+/).filter(Boolean)
  if (!sentence || tokens.length === 0) return null

  const [first, ...rest] = tokens
  const head = forms(first).map(escape).join('|')
  const tail = rest.map((t) => `\\s+${escape(t)}`).join('')
  const pattern = new RegExp(`(?<![\\p{L}])(?:${head})${tail}(?![\\p{L}])`, 'giu')

  return pattern.test(sentence) ? sentence.replace(pattern, BLANK) : null
}
