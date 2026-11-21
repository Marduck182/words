// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMock } from '../lib/mockApi'
import { useApp } from '../store'
import LotsPage from './LotsPage'

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

async function open(learned = 0) {
  resetMock(learned)
  useApp.setState({ ready: false, error: null, today: null, stats: null, hardCount: 0, allWords: [] })
  await useApp.getState().refresh()
}

const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>

function renderLots() {
  return render(
    <MemoryRouter initialEntries={['/lots']}>
      <Routes>
        <Route path="/lots" element={<LotsPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => open())

describe('LotsPage', () => {
  it('lista todos los lotes del set según las palabras por día', async () => {
    renderLots()
    expect(await screen.findByText('Lote 1')).toBeInTheDocument()
    expect(screen.getByText('Lote 72')).toBeInTheDocument() // 3 594 palabras en lotes de 50
    expect(screen.getByText(/palabras 51 a 100/i)).toBeInTheDocument()
  })

  it('al empezar un lote lo abre como lote en curso y va a la práctica', async () => {
    const user = userEvent.setup()
    renderLots()
    await user.click(await screen.findByRole('button', { name: 'Empezar lote 2' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/practice')
    const lot = useApp.getState().today!.lot!
    expect([lot.start_id, lot.end_id]).toEqual([51, 100])
  })

  it('"Lote aleatorio" abre un lote de palabras sueltas del set y va a la práctica', async () => {
    const user = userEvent.setup()
    renderLots()
    await user.click(await screen.findByRole('button', { name: /lote aleatorio/i }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/practice')
    const lot = useApp.getState().today!.lot!
    const ids = lot.words.map((w) => w.id)
    expect(lot.random).toBe(true)
    expect(lot.size).toBe(50)
    expect(Math.max(...ids) - Math.min(...ids)).toBeGreaterThan(50) // no son 50 consecutivas
  })

  it('un lote a medias dice "Continuar" y muestra su avance', async () => {
    await open(20) // 20 de las 50 del lote 1
    renderLots()
    expect(await screen.findByRole('button', { name: 'Continuar lote 1' })).toBeInTheDocument()
    expect(screen.getByText('20 de 50')).toBeInTheDocument()
  })

  it('un lote aprendido se puede repasar, sin abrirlo como lote', async () => {
    await open(50)
    const user = userEvent.setup()
    renderLots()
    await user.click(await screen.findByRole('button', { name: 'Repasar lote 1' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/practice?review=1-50')
  })

  it('el filtro de pendientes oculta los lotes ya aprendidos', async () => {
    await open(50)
    const user = userEvent.setup()
    renderLots()
    await screen.findByText('Lote 1')
    await user.click(screen.getByRole('button', { name: 'Pendientes' }))
    const list = screen.getByRole('list', { name: /lotes/i })
    expect(within(list).queryByText('Lote 1')).not.toBeInTheDocument()
    expect(within(list).getByText('Lote 2')).toBeInTheDocument()
  })
})
