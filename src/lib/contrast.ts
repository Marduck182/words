export interface Rgb {
  /** Canales lineales (sin gamma) entre 0 y 1. */
  r: number
  g: number
  b: number
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** OKLCH → RGB lineal (Björn Ottosson). Los colores fuera del gamut sRGB se recortan. */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  }
}

const luminance = (c: Rgb) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

/** Ratio de contraste WCAG entre dos colores (1 a 21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mezcla `fg` con opacidad `alpha` sobre `bg`. */
export function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  }
}
