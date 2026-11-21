// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HotkeyField } from './HotkeyField'

afterEach(cleanup)

function setup(onSave = vi.fn().mockResolvedValue(undefined), extra: { warning?: boolean } = {}) {
  const user = userEvent.setup()
  render(<HotkeyField value="Control+Alt+W" onSave={onSave} {...extra} />)
  return { user, onSave }
}

const combo = '{Control>}{Alt>}k{/Alt}{/Control}'

describe('HotkeyField', () => {
  it('muestra el atajo actual como teclas', () => {
    setup()
    for (const key of ['Ctrl', 'Alt', 'W']) expect(screen.getByText(key)).toBeInTheDocument()
  })

  it('graba una combinación nueva y la guarda', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: /cambiar atajo/i }))
    expect(screen.getByText(/pulsa la nueva combinación/i)).toBeInTheDocument()
    await user.keyboard(combo)
    expect(screen.getByText('K')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /guardar atajo/i }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Control+Alt+K')
    expect(screen.getByRole('button', { name: /cambiar atajo/i })).toBeInTheDocument()
  })

  it('no deja guardar hasta que haya una combinación válida', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /cambiar atajo/i }))
    expect(screen.getByRole('button', { name: /guardar atajo/i })).toBeDisabled()
    await user.keyboard('k') // sin modificador no cuenta
    expect(screen.getByRole('button', { name: /guardar atajo/i })).toBeDisabled()
  })

  it('Escape cancela sin guardar y conserva el atajo anterior', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: /cambiar atajo/i }))
    await user.keyboard(combo)
    await user.keyboard('{Escape}')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('W')).toBeInTheDocument()
    expect(screen.queryByText('K')).not.toBeInTheDocument()
  })

  it('si no se pudo guardar muestra el motivo y sigue grabando', async () => {
    const { user } = setup(vi.fn().mockRejectedValue('Otra app ya lo tiene'))
    await user.click(screen.getByRole('button', { name: /cambiar atajo/i }))
    await user.keyboard(combo)
    await user.click(screen.getByRole('button', { name: /guardar atajo/i }))
    expect(await screen.findByText('Otra app ya lo tiene')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar atajo/i })).toBeInTheDocument()
  })

  it('avisa cuando el atajo guardado no se pudo registrar', () => {
    setup(undefined, { warning: true })
    expect(screen.getByText(/otra aplicación ya usa este atajo/i)).toBeInTheDocument()
  })
})
