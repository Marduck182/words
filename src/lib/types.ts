export interface Word {
  id: number
  word: string
  translation: string
  ipa: string | null
  example_en: string | null
  example_es: string | null
  book: number | null
}

export interface LotWord extends Word {
  learned: boolean
  is_hard: boolean
}

export interface LotView {
  /** 0 cuando es solo una vista (repaso) y no un lote abierto. */
  lot: number
  start_id: number
  end_id: number
  size: number
  learned: number
  words: LotWord[]
  /** Lote armado con palabras sueltas al azar, no con un rango consecutivo. */
  random: boolean
}

export type TodayStatus = 'active' | 'goal_met' | 'finished'

export interface Today {
  status: TodayStatus
  lot: LotView | null
  lots_completed_today: number
}

export interface Stats {
  total_words: number
  learned: number
  hard: number
  lots_completed: number
  accuracy: number | null
}

/** Un lote del listado "Elegir lote": el set troceado según palabras por día. */
export interface LotSummary {
  lot: number
  start_id: number
  end_id: number
  size: number
  learned: number
  book: number | null
  status: 'new' | 'partial' | 'done'
  current: boolean
}

/** Dirección de práctica elegida en ajustes. */
export type DirectionSetting = 'es_en' | 'en_es' | 'mixed'
/** Dirección concreta de una tarjeta. */
export type Direction = 'es_en' | 'en_es'
export type Verdict = 'correct' | 'almost' | 'synonym' | 'wrong'

export type ThemeSetting = 'light' | 'dark' | 'system'
/** Los dos estilos visuales a comparar. */
export type Skin = 'foco' | 'cuaderno'

export interface Settings {
  words_per_day: number
  direction: DirectionSetting
  theme: ThemeSetting
  /** Intentos por palabra antes de mostrar la respuesta. */
  max_attempts: number
  /** Atajo global que muestra y oculta la ventana, p. ej. "Control+Alt+W". */
  hotkey: string
  /** Ocultar la ventana al hacer clic fuera de ella. */
  hide_on_blur: boolean
  /** Mantener la ventana por encima de las demás. */
  always_on_top: boolean
  /** Pronunciar en inglés (voz del sistema) al acertar y al revelar una respuesta. */
  speak: boolean
}
