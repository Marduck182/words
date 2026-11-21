// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMock } from '../lib/mockApi'
import { useApp } from '../store'
import SettingsPage from './SettingsPage'

class FakeUtterance {
  voice: unknown = null
  lang = ''
  rate = 1
  constructor(public text: string) {}
}

function installSynth(voices: { name: string; lang: string; localService: boolean }[]) {
  const speak = vi.fn()
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { getVoices: () => voices, speak, cancel: vi.fn(), addEventListener() {}, removeEventListener() {} },
  })
  return speak
}

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance
})

beforeEach(async () => {
  resetMock()
  useApp.setState({ ready: false, error: null, today: null, stats: null, hardCount: 0, allWords: [] })
  await useApp.getState().refresh()
})

afterEach(cleanup)

const renderPage = () =>
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )

const group = (name: RegExp) => screen.getByRole('group', { name })

describe('SettingsPage: pronunciación', () => {
  it('viene activada y se puede apagar', async () => {
    installSynth([{ name: 'Voz US', lang: 'en-US', localService: true }])
    const user = userEvent.setup()
    renderPage()
    const toggle = group(/pronunciar palabras en inglés/i)
    expect(within(toggle).getByRole('button', { name: 'Sí' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(toggle).getByRole('button', { name: 'No' }))
    expect(useApp.getState().settings.speak).toBe(false)
  })

  it('"Probar" pronuncia una palabra con la voz en inglés', async () => {
    const speak = installSynth([{ name: 'Voz US', lang: 'en-US', localService: true }])
    const user = userEvent.setup()
    renderPage()
    const test = await screen.findByRole('button', { name: /probar voz/i })
    await user.click(test)
    expect(speak).toHaveBeenCalledTimes(1)
    expect((speak.mock.calls[0][0] as FakeUtterance).lang).toBe('en-US')
  })

  it('avisa si Windows no tiene una voz en inglés y no deja probar', async () => {
    installSynth([{ name: 'Voz ES', lang: 'es-MX', localService: true }])
    renderPage()
    expect(await screen.findByText(/no tiene una voz en inglés/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /probar voz/i })).toBeDisabled()
  })

  it('no avisa cuando hay una voz en inglés', async () => {
    installSynth([{ name: 'Voz GB', lang: 'en-GB', localService: true }])
    renderPage()
    await screen.findByRole('button', { name: /probar voz/i })
    expect(screen.queryByText(/no tiene una voz en inglés/i)).not.toBeInTheDocument()
  })
})
