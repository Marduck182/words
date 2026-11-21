import { describe, expect, it } from 'vitest'
import { acceleratorParts, eventToAccelerator, type KeyLike } from './hotkey'

const press = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
})

describe('eventToAccelerator', () => {
  it('convierte Ctrl+Alt+W', () => {
    expect(eventToAccelerator(press('KeyW', { ctrlKey: true, altKey: true }))).toBe('Control+Alt+W')
  })
  it('siempre ordena los modificadores igual', () => {
    expect(eventToAccelerator(press('Space', { shiftKey: true, ctrlKey: true }))).toBe('Control+Shift+Space')
  })
  it('acepta dígitos, teclas de función y flechas', () => {
    expect(eventToAccelerator(press('Digit5', { ctrlKey: true, altKey: true }))).toBe('Control+Alt+5')
    expect(eventToAccelerator(press('F8', { ctrlKey: true }))).toBe('Control+F8')
    expect(eventToAccelerator(press('ArrowUp', { ctrlKey: true, altKey: true }))).toBe('Control+Alt+ArrowUp')
  })
  it('la tecla Windows es Super', () => {
    expect(eventToAccelerator(press('KeyK', { metaKey: true }))).toBe('Super+K')
  })
  it('sin tecla (solo modificadores) todavía no hay atajo', () => {
    expect(eventToAccelerator(press('ControlLeft', { ctrlKey: true }))).toBeNull()
    expect(eventToAccelerator(press('ShiftRight', { shiftKey: true }))).toBeNull()
  })
  it('sin modificador no hay atajo, para no secuestrar teclas sueltas', () => {
    expect(eventToAccelerator(press('KeyW'))).toBeNull()
    expect(eventToAccelerator(press('F5'))).toBeNull()
  })
  it('Escape se reserva para cancelar y teclas raras se rechazan', () => {
    expect(eventToAccelerator(press('Escape', { ctrlKey: true }))).toBeNull()
    expect(eventToAccelerator(press('IntlBackslash', { ctrlKey: true }))).toBeNull()
  })
})

describe('acceleratorParts', () => {
  it('separa en teclas legibles', () => {
    expect(acceleratorParts('Control+Alt+W')).toEqual(['Ctrl', 'Alt', 'W'])
    expect(acceleratorParts('Control+Shift+Space')).toEqual(['Ctrl', 'Mayús', 'Espacio'])
    expect(acceleratorParts('Super+K')).toEqual(['Win', 'K'])
  })
})
