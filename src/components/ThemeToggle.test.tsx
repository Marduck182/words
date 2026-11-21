// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMock } from '../lib/mockApi'
import { useApp } from '../store'
import { ThemeToggle } from './ThemeToggle'

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
})

beforeEach(async () => {
  resetMock()
  useApp.setState({ ready: false, error: null, today: null, stats: null, hardCount: 0, allWords: [] })
  await useApp.getState().refresh()
})

afterEach(cleanup)

describe('ThemeToggle', () => {
  it('dice el tema actual y avanza Sistema → Claro → Oscuro → Sistema', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const button = () => screen.getByRole('button', { name: /tema/i })

    expect(button()).toHaveAccessibleName(/sistema/i)
    await user.click(button())
    expect(useApp.getState().settings.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(button()).toHaveAccessibleName(/claro/i)

    await user.click(button())
    expect(useApp.getState().settings.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(button())
    expect(useApp.getState().settings.theme).toBe('system')
  })
})
