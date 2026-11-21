export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export const number = (n: number) => n.toLocaleString('es-MX')

/** "viernes, 20 de noviembre" con la primera letra en mayúscula. */
export function longDate(d = new Date()): string {
  const s = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
