import { create } from 'zustand'
import { api, errorMessage } from './lib/api'
import type { Settings, Skin, Stats, Today, Word } from './lib/types'
import { applyAppearance, loadSkin, saveSkin } from './theme'

interface AppState {
  ready: boolean
  error: string | null
  settings: Settings
  today: Today | null
  stats: Stats | null
  hardCount: number
  /** Todas las palabras (se cargan al practicar): sirven para reconocer sinónimos de cualquier lote. */
  allWords: Word[]
  skin: Skin
  /** Carga todo desde la base de datos. */
  refresh: () => Promise<void>
  loadAllWords: () => Promise<void>
  /** Abre el siguiente lote aunque ya se haya cumplido la meta de hoy. */
  advance: () => Promise<void>
  /** Abre el rango como lote en curso. */
  selectLot: (startId: number, endId: number) => Promise<void>
  /** Abre un lote con palabras al azar de las que aún no has aprendido. */
  startRandomLot: () => Promise<void>
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
  setSkin: (skin: Skin) => void
  setError: (message: string | null) => void
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  error: null,
  settings: {
    words_per_day: 50,
    direction: 'es_en',
    theme: 'system',
    max_attempts: 3,
    hotkey: 'Control+Alt+W',
    hide_on_blur: false,
    always_on_top: true,
    speak: true,
  },
  today: null,
  stats: null,
  hardCount: 0,
  allWords: [],
  skin: loadSkin(),

  async refresh() {
    try {
      const [settings, today, stats, hard] = await Promise.all([
        api.getSettings(),
        api.getToday(false),
        api.getStats(),
        api.getHardWords(),
      ])
      set({ settings, today, stats, hardCount: hard.length, ready: true, error: null })
      applyAppearance(get().skin, settings.theme)
    } catch (e) {
      set({ error: errorMessage(e), ready: true })
    }
  },

  async loadAllWords() {
    if (get().allWords.length > 0) return
    try {
      set({ allWords: await api.getAllWords() })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },

  async advance() {
    try {
      set({ today: await api.getToday(true), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },

  async selectLot(startId, endId) {
    try {
      set({ today: await api.selectLot(startId, endId), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  async startRandomLot() {
    try {
      set({ today: await api.startRandomLot(), error: null })
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  async setSetting(key, value) {
    try {
      // Las casillas viajan como '1'/'0'.
      await api.setSetting(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
      set({ settings: { ...get().settings, [key]: value }, error: null })
      if (key === 'theme') applyAppearance(get().skin, value as Settings['theme'])
    } catch (e) {
      set({ error: errorMessage(e) })
      throw e
    }
  },

  setSkin(skin) {
    saveSkin(skin)
    set({ skin })
    applyAppearance(skin, get().settings.theme)
  },

  setError: (error) => set({ error }),
}))
