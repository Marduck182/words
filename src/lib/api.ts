import { invoke } from '@tauri-apps/api/core'
import type { DirectionSetting, LotSummary, LotView, Settings, Stats, ThemeSetting, Today, Word } from './types'

export interface Api {
  getToday(advance?: boolean): Promise<Today>
  recordAnswer(wordId: number, correct: boolean): Promise<void>
  completeLot(lot: number): Promise<void>
  getHardWords(): Promise<Word[]>
  getAllWords(): Promise<Word[]>
  setHard(wordId: number, hard: boolean): Promise<void>
  getStats(): Promise<Stats>
  getLotList(): Promise<LotSummary[]>
  /** Abre ese rango como lote en curso y devuelve el estado de hoy. */
  selectLot(startId: number, endId: number): Promise<Today>
  /** Abre un lote con palabras al azar entre las que aún no has aprendido. */
  startRandomLot(): Promise<Today>
  /** Las palabras de un rango con su avance, sin abrir ningún lote (para repasar). */
  getLotView(startId: number, endId: number): Promise<LotView>
  getSettings(): Promise<Settings>
  setSetting(key: keyof Settings, value: string): Promise<void>
  /** Esconde la ventana (la app sigue en la bandeja). */
  hideWindow(): Promise<void>
  /** false si otra app ya tenía el atajo global y no se pudo registrar. */
  hotkeyStatus(): Promise<boolean>
  /** false si Windows tiene apagados los efectos de transparencia. */
  transparencyEnabled(): Promise<boolean>
}

export function parseSettings(raw: Record<string, string>): Settings {
  return {
    words_per_day: Number(raw.words_per_day) || 50,
    direction: (raw.direction as DirectionSetting) || 'es_en',
    theme: (raw.theme as ThemeSetting) || 'system',
    max_attempts: Number(raw.max_attempts) || 3,
    hotkey: raw.hotkey || 'Control+Alt+W',
    hide_on_blur: raw.hide_on_blur === '1',
    always_on_top: raw.always_on_top !== '0',
    speak: raw.speak !== '0',
  }
}

const tauriApi: Api = {
  getToday: (advance = false) => invoke('get_today', { advance }),
  recordAnswer: (wordId, correct) => invoke('record_answer', { wordId, correct }),
  completeLot: (lot) => invoke('complete_lot', { lot }),
  getHardWords: () => invoke('get_hard_words'),
  getAllWords: () => invoke('get_all_words'),
  setHard: (wordId, hard) => invoke('set_hard', { wordId, hard }),
  getStats: () => invoke('get_stats'),
  getLotList: () => invoke('get_lot_list'),
  selectLot: (startId, endId) => invoke('select_lot', { startId, endId }),
  startRandomLot: () => invoke('start_random_lot'),
  getLotView: (startId, endId) => invoke('get_lot_view', { startId, endId }),
  getSettings: async () => parseSettings(await invoke('get_settings')),
  setSetting: (key, value) => invoke('set_setting', { key, value }),
  hideWindow: () => invoke('hide_window'),
  hotkeyStatus: () => invoke('hotkey_status'),
  transparencyEnabled: () => invoke('transparency_enabled'),
}

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let loaded: Promise<Api> | null = null
function impl(): Promise<Api> {
  if (!loaded) {
    if (inTauri) loaded = Promise.resolve(tauriApi)
    // Solo en desarrollo: una base simulada para ver la interfaz en un navegador.
    else if (import.meta.env.DEV) loaded = import('./mockApi').then((m) => m.mockApi)
    else loaded = Promise.reject(new Error('La app debe ejecutarse dentro de Tauri'))
  }
  return loaded
}

/** Cada llamada espera a la implementación real (Tauri) o a la simulada (solo en desarrollo). */
export const api: Api = {
  getToday: (a) => impl().then((i) => i.getToday(a)),
  recordAnswer: (id, ok) => impl().then((i) => i.recordAnswer(id, ok)),
  completeLot: (lot) => impl().then((i) => i.completeLot(lot)),
  getHardWords: () => impl().then((i) => i.getHardWords()),
  getAllWords: () => impl().then((i) => i.getAllWords()),
  setHard: (id, hard) => impl().then((i) => i.setHard(id, hard)),
  getStats: () => impl().then((i) => i.getStats()),
  getLotList: () => impl().then((i) => i.getLotList()),
  selectLot: (s, e) => impl().then((i) => i.selectLot(s, e)),
  startRandomLot: () => impl().then((i) => i.startRandomLot()),
  getLotView: (s, e) => impl().then((i) => i.getLotView(s, e)),
  getSettings: () => impl().then((i) => i.getSettings()),
  setSetting: (k, v) => impl().then((i) => i.setSetting(k, v)),
  hideWindow: () => impl().then((i) => i.hideWindow()),
  hotkeyStatus: () => impl().then((i) => i.hotkeyStatus()),
  transparencyEnabled: () => impl().then((i) => i.transparencyEnabled()),
}

/** Los errores de Tauri llegan como texto; los de JS como Error. */
export function errorMessage(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : 'Error desconocido'
}
