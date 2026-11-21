import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composite, contrastRatio, oklchToRgb, type Rgb } from './contrast'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('utilidades de contraste', () => {
  it('oklch(1 0 0) es blanco y oklch(0 0 0) es negro', () => {
    const white = oklchToRgb(1, 0, 0)
    const black = oklchToRgb(0, 0, 0)
    for (const v of [white.r, white.g, white.b]) expect(v).toBeCloseTo(1, 2)
    for (const v of [black.r, black.g, black.b]) expect(v).toBeCloseTo(0, 2)
  })
  it('blanco contra negro es 21:1 y un color contra sí mismo es 1:1', () => {
    expect(contrastRatio(oklchToRgb(1, 0, 0), oklchToRgb(0, 0, 0))).toBeCloseTo(21, 0)
    const c = oklchToRgb(0.5, 0.1, 200)
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5)
  })
  it('un gris oklch(0.6 0 0) es 0,6³ = 0,216 en RGB lineal (≈ #777 con gamma)', () => {
    const grey = oklchToRgb(0.6, 0, 0)
    expect(grey.r).toBeCloseTo(0.216, 3)
    expect(grey.g).toBeCloseTo(0.216, 3)
    expect(grey.b).toBeCloseTo(0.216, 3)
  })
  it('compone con opacidad sobre un fondo', () => {
    const out = composite({ r: 1, g: 1, b: 1 }, 0.5, { r: 0, g: 0, b: 0 })
    expect(out).toEqual({ r: 0.5, g: 0.5, b: 0.5 })
  })
})

// ───────── Tokens reales de src/index.css ─────────

/** Lee los `--token: oklch(...)` de un bloque como `:root[data-skin="foco"][data-theme="light"]`. */
function tokens(skin: string, theme: string): Record<string, { rgb: Rgb; alpha: number }> {
  const header = `:root[data-skin="${skin}"][data-theme="${theme}"] {`
  const start = css.indexOf(header)
  if (start < 0) throw new Error(`No encontré el bloque ${header}`)
  const block = css.slice(start, css.indexOf('}', start))
  const out: Record<string, { rgb: Rgb; alpha: number }> = {}
  for (const m of block.matchAll(/--([a-z-]+):\s*oklch\(([^)]+)\)/g)) {
    const [color, alpha] = m[2].split('/').map((s) => s.trim())
    const [l, c, h] = color.split(/\s+/).map(Number)
    out[m[1]] = { rgb: oklchToRgb(l, c, h), alpha: alpha ? Number(alpha) : 1 }
  }
  return out
}

/** Color de un token ya compuesto sobre el fondo (los subrayadores tienen opacidad). */
const solid = (t: ReturnType<typeof tokens>, name: string, over: Rgb): Rgb =>
  composite(t[name].rgb, t[name].alpha, over)

/** Opacidad real del texto de ejemplo del campo de respuesta (1 si no se declara). */
function placeholderOpacity(): number {
  const start = css.indexOf('.answer-field::placeholder {')
  if (start < 0) throw new Error('No encontré .answer-field::placeholder')
  const block = css.slice(start, css.indexOf('}', start))
  const m = /opacity:\s*([\d.]+)/.exec(block)
  return m ? Number(m[1]) : 1
}

const SKINS = ['foco', 'cuaderno']
const THEMES = ['light', 'dark']

describe.each(SKINS.flatMap((s) => THEMES.map((t) => [s, t] as const)))('contraste de texto: %s %s', (skin, theme) => {
  const t = tokens(skin, theme)
  const bg = t.bg.rgb
  const panel = t.panel.rgb
  const ratio = (fg: string, back: Rgb) => contrastRatio(solid(t, fg, back), back)

  it('el texto principal sobre el fondo y el panel llega a AA (4,5:1)', () => {
    expect(ratio('ink', bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('ink', panel)).toBeGreaterThanOrEqual(4.5)
  })
  it('el texto secundario (muted) sobre el fondo y el panel llega a AA', () => {
    expect(ratio('muted', bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('muted', panel)).toBeGreaterThanOrEqual(4.5)
  })
  it('el texto del botón principal llega a AA', () => {
    expect(contrastRatio(t['on-primary'].rgb, t.primary.rgb)).toBeGreaterThanOrEqual(4.5)
  })
  it('el control seleccionado (texto del fondo sobre tinta) llega a AA', () => {
    expect(contrastRatio(bg, t.ink.rgb)).toBeGreaterThanOrEqual(4.5)
  })
  it('acierto, error y aviso se leen sobre sus fondos', () => {
    for (const [fg, back] of [['ok', 'ok-bg'], ['bad', 'bad-bg'], ['warn', 'warn-bg']] as const) {
      expect(contrastRatio(t[fg].rgb, solid(t, back, bg)), `${fg} sobre ${back}`).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('el aviso de error sobre el fondo normal también se lee (texto suelto)', () => {
    expect(ratio('bad', bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('ok', bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('el texto de ejemplo (placeholder) llega a AA con su opacidad real', () => {
    const effective = composite(t.muted.rgb, placeholderOpacity(), bg)
    expect(contrastRatio(effective, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('los bordes de los controles se distinguen del fondo (3:1, WCAG 1.4.11)', () => {
    expect(contrastRatio(t['line-strong'].rgb, bg)).toBeGreaterThanOrEqual(3)
  })
  it('el anillo de foco se distingue del fondo (3:1)', () => {
    expect(contrastRatio(t.focus.rgb, bg)).toBeGreaterThanOrEqual(3)
  })
})
