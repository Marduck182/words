// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { resetMock } from '../lib/mockApi'
import type { LotWord } from '../lib/types'
import { useApp } from '../store'
import Home from './Home'
import PracticePage from './PracticePage'

beforeAll(() => {
  // jsdom no trae matchMedia; el tema "sistema" lo necesita.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
})

let lot: LotWord[]
let lotNumber: number

beforeEach(async () => {
  resetMock()
  await api.setSetting('words_per_day', '2')
  await api.setSetting('max_attempts', '1') // el primer error ya revela la respuesta
  useApp.setState({ ready: false, error: null, today: null, stats: null, hardCount: 0, allWords: [] })
  await useApp.getState().refresh()
  const today = useApp.getState().today!.lot!
  lot = today.words
  lotNumber = today.lot
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Las pruebas de integración no esperan la pausa del acierto (flashMs=0); esa pausa se prueba en Practice. */
function renderAt(path: string, flashMs = 0) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/practice" element={<PracticePage flashMs={flashMs} />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La palabra cuya traducción es el título que se está mostrando (dirección es → en). */
const shown = () => lot.find((w) => w.translation === screen.getByRole('heading', { level: 1 }).textContent)!
const submit = (user: ReturnType<typeof userEvent.setup>, text: string) =>
  user.type(screen.getByRole('textbox', { name: /respuesta/i }), `${text}{Enter}`)
const waitFor = (w: LotWord) => screen.findByRole('heading', { level: 1, name: w.translation }, { timeout: 3000 })
const other = (w: LotWord) => lot.find((x) => x.id !== w.id)!

describe('PracticePage', () => {
  it('con flashMs=0 pasa a la siguiente tarjeta sin esperar ningún temporizador', async () => {
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) }) // Testing Library lo busca para avanzar los temporizadores
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/practice')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) // si hubiera una pausa, nunca se cumpliría
    try {
      const first = shown()
      await submit(user, first.word)
      expect(screen.getByRole('heading', { level: 1, name: other(first).translation })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('al terminar el lote muestra el resumen con las palabras falladas', async () => {
    const user = userEvent.setup()
    renderAt('/practice')
    const first = shown()
    await submit(user, 'zzz') // falla: se revela la respuesta
    await submit(user, first.word) // la copia
    const second = other(first)
    await waitFor(second)
    await submit(user, second.word)
    await waitFor(first)
    await submit(user, first.word)

    expect(await screen.findByText('Lote completo', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('1 de 2 palabras a la primera.')).toBeInTheDocument()
    expect(screen.getByText(first.word)).toBeInTheDocument() // en la lista "Para repasar"
  })

  it('salir a mitad de lote actualiza el progreso que muestra Inicio', async () => {
    const user = userEvent.setup()
    renderAt('/practice')
    await submit(user, shown().word)
    await user.keyboard('{Escape}')
    expect(await screen.findByText(/Te falta 1 palabra/, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('si no se pudo cerrar el lote no dice "Lote completo"', async () => {
    vi.spyOn(api, 'completeLot').mockRejectedValue('Faltan 1 palabras por aprender en este lote')
    const user = userEvent.setup()
    renderAt('/practice')
    const first = shown()
    await submit(user, first.word)
    const second = other(first)
    await waitFor(second)
    await submit(user, second.word)

    expect(await screen.findByText(/No se pudo cerrar el lote/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText('Lote completo')).not.toBeInTheDocument()
  })

  it('un lote ya aprendido pero sin cerrar se cierra solo y muestra el resumen', async () => {
    for (const w of lot) await api.recordAnswer(w.id, true)
    await useApp.getState().refresh()
    renderAt('/practice')
    expect(await screen.findByText('Lote completo', {}, { timeout: 3000 })).toBeInTheDocument()
    expect((await api.getStats()).lots_completed).toBe(1)
  })

  it('repasar un lote ya completo practica todas sus palabras sin cerrar nada', async () => {
    for (const w of lot) await api.recordAnswer(w.id, true)
    await api.completeLot(lotNumber)
    const spy = vi.spyOn(api, 'completeLot')
    const user = userEvent.setup()
    renderAt(`/practice?review=${lot[0].id}-${lot[lot.length - 1].id}`)

    const first = await screen.findByRole('heading', { level: 1 })
    const firstWord = lot.find((w) => w.translation === first.textContent)!
    await submit(user, firstWord.word)
    const second = other(firstWord)
    await waitFor(second)
    await submit(user, second.word)

    expect(await screen.findByText('Repaso terminado', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})
