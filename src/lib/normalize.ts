/** Minúsculas, sin acentos (la ñ cuenta como n), sin puntuación y con espacios simples. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const LEADING = {
  es: /^(?:el|la|los|las|un|una|unos|unas)\s+(?=\S)/,
  en: /^to\s+(?=\S)/,
}

/** Quita el artículo español o el "to" de infinitivo inglés. Recibe texto ya normalizado. */
export function stripLeading(s: string, kind: 'es' | 'en'): string {
  return s.replace(LEADING[kind], '')
}
