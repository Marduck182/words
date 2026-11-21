// Solo desarrollo y tests: imita los comandos de Rust (mismas reglas que db.rs) para ver la interfaz
// en un navegador normal. Parámetros de URL: ?learned=20 (aprendidas en el lote 1), ?hard=6, ?theme=dark.
import raw from '../../src-tauri/data/words.json'
import { parseSettings, type Api } from './api'
import type { LotSummary, LotView, Stats, Today, Word } from './types'

const words = raw as Word[]
const maxId = words.length

type Progress = { learned: boolean; hard: boolean; streak: number; attempts: number; correct: number; okOn?: string }
/** `ids` solo existe en los lotes aleatorios; los demás son el rango start..=end. */
type Lot = { lot: number; start: number; end: number; completedOn: string | null; ids?: number[] }

let progress = new Map<number, Progress>()
let lots: Lot[] = []
let currentLot: number | null = null
let settings: Record<string, string> = {}

const last = <T>(items: T[]): T | undefined => items[items.length - 1]
const day = () => new Date().toISOString().slice(0, 10)
const prog = (id: number): Progress => {
  if (!progress.has(id)) progress.set(id, { learned: false, hard: false, streak: 0, attempts: 0, correct: 0 })
  return progress.get(id)!
}

/** Deja la base simulada como nueva. Los tests la llaman antes de cada caso. */
export function resetMock(preLearned = 0, preHard = 0) {
  progress = new Map()
  lots = []
  currentLot = null
  settings = {
    words_per_day: '50',
    direction: 'es_en',
    theme: 'system',
    max_attempts: '3',
    hotkey: 'Control+Alt+W',
    hide_on_blur: '0',
    always_on_top: '1',
    speak: '1',
  }
  if (preLearned > 0) {
    lots.push({ lot: 1, start: 1, end: 50, completedOn: null })
    currentLot = 1
    for (let id = 1; id <= preLearned; id++) Object.assign(prog(id), { learned: true, attempts: 1, correct: 1 })
  }
  for (let id = 100; id < 100 + preHard; id++) Object.assign(prog(id), { hard: true, attempts: 2, correct: 1 })
}

const params = new URLSearchParams(globalThis.location?.search ?? '')
resetMock(Number(params.get('learned') ?? 0), Number(params.get('hard') ?? 0))
if (params.get('theme')) settings.theme = params.get('theme')!

const perDay = () => Number(settings.words_per_day)

function build(lot: number, slice: Word[], random: boolean, start: number, end: number): LotView {
  const ws = slice.map((w) => ({ ...w, learned: prog(w.id).learned, is_hard: prog(w.id).hard }))
  return { lot, start_id: start, end_id: end, size: ws.length, learned: ws.filter((w) => w.learned).length, words: ws, random }
}
const view = (lot: number, start: number, end: number) =>
  build(lot, words.filter((w) => w.id >= start && w.id <= end), false, start, end)
const viewOf = (l: Lot) =>
  l.ids ? build(l.lot, words.filter((w) => l.ids!.includes(w.id)), true, l.start, l.end) : view(l.lot, l.start, l.end)

function openLot(start: number, end: number): number {
  let lot = last(lots.filter((l) => !l.ids && l.start === start && l.end === end && !l.completedOn))
  if (!lot) {
    lot = { lot: Math.max(0, ...lots.map((l) => l.lot)) + 1, start, end, completedOn: null }
    lots.push(lot)
  }
  currentLot = lot.lot
  return lot.lot
}

function current(): Lot | undefined {
  if (currentLot !== null) return lots.find((l) => l.lot === currentLot && !l.completedOn)
  return last(lots.filter((l) => !l.completedOn))
}

export const mockApi: Api = {
  async getToday(advance = false): Promise<Today> {
    const doneToday = lots.filter((l) => l.completedOn === day()).length
    const wrap = (status: Today['status'], lot: LotView | null): Today => ({ status, lot, lots_completed_today: doneToday })
    const open = current()
    if (open) return wrap('active', viewOf(open))
    const start = words.find((w) => !prog(w.id).learned)?.id
    if (start === undefined) return wrap('finished', null)
    if (doneToday > 0 && !advance) return wrap('goal_met', null)
    const end = Math.min(start + perDay() - 1, maxId)
    return wrap('active', view(openLot(start, end), start, end))
  },
  async recordAnswer(id, correct) {
    const p = prog(id)
    p.attempts++
    if (correct) {
      p.correct++
      p.learned = true
      // Mismas reglas que db.rs: 2 aciertos en días distintos; el reintento tras fallar no cuenta.
      if (!p.hard) p.streak = 0
      else if (p.streak < 0) p.streak = 0
      else if (p.okOn !== day()) {
        p.streak++
        p.okOn = day()
      }
      if (p.hard && p.streak >= 2) Object.assign(p, { hard: false, streak: 0, okOn: undefined })
    } else Object.assign(p, { hard: true, streak: -1, okOn: undefined })
  },
  async completeLot(lot) {
    const l = lots.find((x) => x.lot === lot)
    if (!l) throw 'El lote no existe'
    if (l.completedOn) return
    const pending = viewOf(l).words.filter((w) => !w.learned).length
    if (pending > 0) throw `Faltan ${pending} palabras por aprender en este lote`
    l.completedOn = day()
  },
  async getHardWords() {
    return words.filter((w) => prog(w.id).hard)
  },
  async getAllWords() {
    return words
  },
  async setHard(id, hard) {
    Object.assign(prog(id), { hard, streak: 0, okOn: undefined })
  },
  async getStats(): Promise<Stats> {
    const all = [...progress.values()]
    const attempts = all.reduce((n, p) => n + p.attempts, 0)
    return {
      total_words: words.length,
      learned: all.filter((p) => p.learned).length,
      hard: all.filter((p) => p.hard).length,
      lots_completed: lots.filter((l) => l.completedOn).length,
      accuracy: attempts ? all.reduce((n, p) => n + p.correct, 0) / attempts : null,
    }
  },
  async getLotList(): Promise<LotSummary[]> {
    const open = current()
    const out: LotSummary[] = []
    for (let start = 1; start <= maxId; start += perDay()) {
      const end = Math.min(start + perDay() - 1, maxId)
      const v = view(0, start, end)
      out.push({
        lot: out.length + 1,
        start_id: start,
        end_id: end,
        size: v.size,
        learned: v.learned,
        book: words[start - 1].book,
        status: v.learned >= v.size ? 'done' : v.learned === 0 ? 'new' : 'partial',
        current: !!open && !open.ids && open.start === start && open.end === end,
      })
    }
    return out
  },
  async selectLot(start, end): Promise<Today> {
    if (start < 1 || end < start || end > maxId) throw `Rango de lote no válido: ${start} a ${end}`
    if (view(0, start, end).words.every((w) => w.learned)) throw 'Ese lote ya está aprendido; puedes repasarlo'
    openLot(start, end)
    return mockApi.getToday(true)
  },
  async startRandomLot(): Promise<Today> {
    const pool = words.filter((w) => !prog(w.id).learned).map((w) => w.id)
    if (pool.length === 0) throw 'No quedan palabras nuevas para un lote aleatorio'
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const ids = pool.slice(0, perDay())
    const lot = Math.max(0, ...lots.map((l) => l.lot)) + 1
    lots.push({ lot, start: Math.min(...ids), end: Math.max(...ids), completedOn: null, ids })
    currentLot = lot
    return mockApi.getToday(true)
  },
  async getLotView(start, end) {
    return view(0, start, end)
  },
  async getSettings() {
    return parseSettings(settings)
  },
  async setSetting(key, value) {
    settings[key] = value
  },
  async hideWindow() {},
  async hotkeyStatus() {
    return true
  },
  async transparencyEnabled() {
    return true
  },
}
