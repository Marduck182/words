/** Preferencias sueltas de la interfaz (por equipo). Si no hay almacenamiento, valen solo para la sesión. */
export function loadFlag(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

export function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* sin almacenamiento */
  }
}
