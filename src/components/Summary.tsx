import type { ReactNode } from 'react'
import { plural } from '../lib/format'
import type { Word } from '../lib/types'

interface Props {
  title: string
  total: number
  missed: Word[]
  /** Texto bajo el título; por defecto cuenta los aciertos a la primera. */
  lead?: string
  missedTitle?: string
  actions: ReactNode
}

export function Summary({ title, total, missed, lead, missedTitle = 'Para repasar', actions }: Props) {
  const firstTry = total - missed.length
  return (
    <main className="summary">
      <h1 className="lead">{title}</h1>
      <p className="sub">
        {lead ?? `${firstTry} de ${total} ${plural(total, 'palabra', 'palabras')} a la primera.`}
      </p>

      {missed.length > 0 && (
        <>
          <h2 className="setting-name" style={{ marginTop: 32 }}>
            {missedTitle}
          </h2>
          <ul className="word-list">
            {missed.map((w) => (
              <li key={w.id}>
                <span className="en">{w.word}</span>
                <span className="es">{w.translation}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="controls">{actions}</div>
    </main>
  )
}
