/**
 * Una entrada por carácter: la letra si está revelada, '' si sigue oculta y ' ' para espacios.
 * Siempre deja al menos una letra oculta.
 */
export function buildHint(answer: string, revealed: number): string[] {
  const letters = [...answer].filter((c) => c !== ' ').length
  const limit = Math.min(revealed, letters - 1)
  let shown = 0
  return [...answer].map((c) => {
    if (c === ' ') return ' '
    if (shown < limit) {
      shown++
      return c
    }
    return ''
  })
}
