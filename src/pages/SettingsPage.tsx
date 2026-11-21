import { useEffect, useState } from 'react'
import { HotkeyField } from '../components/HotkeyField'
import { Segmented } from '../components/Segmented'
import { api, errorMessage } from '../lib/api'
import { hasEnglishVoice, speak } from '../lib/tts'
import type { DirectionSetting, Skin, ThemeSetting } from '../lib/types'
import { useApp } from '../store'

const DIRECTIONS: { value: DirectionSetting; label: string }[] = [
  { value: 'es_en', label: 'Español → inglés' },
  { value: 'en_es', label: 'Inglés → español' },
  { value: 'mixed', label: 'Mixto' },
]
const ATTEMPTS = ['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))
const YES_NO = [
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
]
const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
]
const SKINS: { value: Skin; label: string }[] = [
  { value: 'foco', label: 'Foco' },
  { value: 'cuaderno', label: 'Cuaderno' },
]

export default function SettingsPage() {
  const { settings, skin, setSetting, setSkin } = useApp()
  const [perDay, setPerDay] = useState(String(settings.words_per_day))
  const [error, setError] = useState<string | null>(null)
  const [hotkeyOk, setHotkeyOk] = useState(true)
  const [voiceOk, setVoiceOk] = useState<boolean | null>(null) // null = todavía comprobando

  useEffect(() => {
    void hasEnglishVoice().then(setVoiceOk)
  }, [])

  useEffect(() => {
    api.hotkeyStatus().then(setHotkeyOk, () => setHotkeyOk(true))
  }, [settings.hotkey])

  async function commitPerDay() {
    const n = Number(perDay)
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      setError('Escribe un número entero entre 1 y 500.')
      return
    }
    if (n === settings.words_per_day) return setError(null)
    try {
      await setSetting('words_per_day', n)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <main className="page">
      <h1 className="lead">Ajustes</h1>

      <section className="settings-group" style={{ marginTop: 32 }}>
        <h2>Práctica</h2>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Palabras nuevas por día</p>
            <p className="setting-help">Aplica a los lotes nuevos; el lote en curso no cambia.</p>
          </div>
          <input
            className="number-field"
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            aria-label="Palabras nuevas por día"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            onBlur={() => void commitPerDay()}
            onKeyDown={(e) => e.key === 'Enter' && void commitPerDay()}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Dirección</p>
            <p className="setting-help">Qué se muestra y qué escribes. Los acentos se ignoran.</p>
          </div>
          <Segmented label="Dirección" value={settings.direction} options={DIRECTIONS} onChange={(v) => void setSetting('direction', v)} />
        </div>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Intentos por palabra</p>
            <p className="setting-help">Cuántas veces puedes intentarlo antes de que se muestre la respuesta.</p>
          </div>
          <Segmented
            label="Intentos por palabra"
            value={String(settings.max_attempts)}
            options={ATTEMPTS}
            onChange={(v) => void setSetting('max_attempts', Number(v))}
          />
        </div>
      </section>

      <section className="settings-group">
        <h2>Sonido</h2>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Pronunciar palabras en inglés</p>
            <p className="setting-help">
              Usa la voz en inglés de Windows, sin internet. Suena al acertar y al ver una respuesta; Ctrl+Espacio la repite.
            </p>
          </div>
          <Segmented
            label="Pronunciar palabras en inglés"
            value={settings.speak ? 'yes' : 'no'}
            options={YES_NO}
            onChange={(v) => void setSetting('speak', v === 'yes')}
          />
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Probar voz"
            disabled={voiceOk !== true}
            onClick={() => speak('Hello! This is how English words will sound.')}
          >
            Probar voz
          </button>
          {voiceOk === false && (
            <p className="field-error" role="alert">
              Windows no tiene una voz en inglés instalada, así que no se pronunciará nada (con una voz en español sonaría mal).
              Instálala en Configuración, Hora e idioma, Voz.
            </p>
          )}
        </div>
      </section>

      <section className="settings-group">
        <h2>Ventana</h2>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Atajo para mostrar u ocultar</p>
            <p className="setting-help">
              Funciona desde cualquier programa. Al cerrar la ventana, Words sigue en la bandeja junto al wifi.
            </p>
          </div>
          <HotkeyField value={settings.hotkey} warning={!hotkeyOk} onSave={(v) => setSetting('hotkey', v)} />
        </div>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Siempre al frente</p>
            <p className="setting-help">Mantiene la ventana por encima de las demás mientras está visible.</p>
          </div>
          <Segmented
            label="Siempre al frente"
            value={settings.always_on_top ? 'yes' : 'no'}
            options={YES_NO}
            onChange={(v) => void setSetting('always_on_top', v === 'yes')}
          />
        </div>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Ocultar al hacer clic fuera</p>
            <p className="setting-help">Si lo dejas en No, la ventana se queda donde la pongas hasta que la ocultes.</p>
          </div>
          <Segmented
            label="Ocultar al hacer clic fuera"
            value={settings.hide_on_blur ? 'yes' : 'no'}
            options={YES_NO}
            onChange={(v) => void setSetting('hide_on_blur', v === 'yes')}
          />
        </div>
      </section>

      <section className="settings-group">
        <h2>Apariencia</h2>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Tema</p>
            <p className="setting-help">Sistema sigue el modo claro u oscuro de Windows.</p>
          </div>
          <Segmented label="Tema" value={settings.theme} options={THEMES} onChange={(v) => void setSetting('theme', v)} />
        </div>
        <div className="setting">
          <div className="setting-text">
            <p className="setting-name">Estilo</p>
            <p className="setting-help">Foco es silencioso y directo. Cuaderno es tipográfico, con subrayador.</p>
          </div>
          <Segmented label="Estilo" value={skin} options={SKINS} onChange={setSkin} />
        </div>
      </section>
    </main>
  )
}
