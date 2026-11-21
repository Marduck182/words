// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { resetMock } from '../lib/mockApi'
import { useApp } from '../store'
import { Shell } from './Shell'

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
})

beforeEach(async () => {
  resetMock()
  useApp.setState({ ready: false, error: null, today: null, stats: null, hardCount: 0, allWords: [] })
  await useApp.getState().refresh()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderShell() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<p>PANTALLA HOY</p>} />
          <Route path="lots" element={<p>PANTALLA LOTES</p>} />
          <Route path="hard" element={<p>PANTALLA DIFICILES</p>} />
          <Route path="settings" element={<input aria-label="campo de ajustes" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return user
}

describe('Shell: navegación con teclado', () => {
  it('las teclas 1 a 4 van a Hoy, Lotes, Difíciles y Ajustes', async () => {
    const user = renderShell()
    await user.keyboard('2')
    expect(screen.getByText('PANTALLA LOTES')).toBeInTheDocument()
    await user.keyboard('3')
    expect(screen.getByText('PANTALLA DIFICILES')).toBeInTheDocument()
    await user.keyboard('4')
    expect(screen.getByLabelText('campo de ajustes')).toBeInTheDocument()
    ;(document.activeElement as HTMLElement)?.blur()
    await user.keyboard('1')
    expect(screen.getByText('PANTALLA HOY')).toBeInTheDocument()
  })

  it('con el foco en un campo de texto, los dígitos se escriben y no navegan', async () => {
    const user = renderShell()
    await user.keyboard('4')
    const input = screen.getByLabelText('campo de ajustes')
    await user.click(input)
    await user.keyboard('2')
    expect(input).toHaveValue('2')
    expect(screen.getByLabelText('campo de ajustes')).toBeInTheDocument() // sigue en Ajustes
  })

  it('Alt+número navega aunque estés escribiendo', async () => {
    const user = renderShell()
    await user.keyboard('4')
    await user.click(screen.getByLabelText('campo de ajustes'))
    await user.keyboard('{Alt>}3{/Alt}')
    expect(screen.getByText('PANTALLA DIFICILES')).toBeInTheDocument()
  })

  it('Ctrl+número y otras combinaciones no navegan', async () => {
    const user = renderShell()
    await user.keyboard('{Control>}2{/Control}')
    expect(screen.getByText('PANTALLA HOY')).toBeInTheDocument()
  })

  it('un 5 o una letra no hacen nada', async () => {
    const user = renderShell()
    await user.keyboard('5')
    await user.keyboard('h')
    expect(screen.getByText('PANTALLA HOY')).toBeInTheDocument()
  })

  it('los enlaces anuncian su atajo para lectores de pantalla y en el tooltip', () => {
    renderShell()
    const lotes = screen.getByRole('link', { name: 'Lotes' })
    expect(lotes).toHaveAttribute('aria-keyshortcuts', '2')
    expect(lotes).toHaveAttribute('title', 'Lotes (2)')
  })
})

describe('Shell: Esc', () => {
  it('Esc esconde la ventana', async () => {
    const spy = vi.spyOn(api, 'hideWindow')
    const user = renderShell()
    await user.keyboard('{Escape}')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
