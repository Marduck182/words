// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Practice, type PracticeProps } from './Practice'
import type { Word } from '../lib/types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const w = (id: number, word: string, translation: string): Word => ({
  id,
  word,
  translation,
  ipa: null,
  example_en: null,
  example_es: null,
  book: 1,
})
const agree = w(1, 'agree', 'Aceptar')
const factory = w(2, 'factory', 'Fábrica')

function setup(over: Partial<PracticeProps> = {}) {
  const props: PracticeProps = {
    words: [agree, factory],
    alreadyDone: 0,
    direction: 'es_en',
    pool: [agree, factory],
    onRecord: vi.fn(),
    onMarkHard: vi.fn(),
    onFinish: vi.fn(),
    onExit: vi.fn(),
    flashMs: 0,
    maxAttempts: 1, // por defecto el primer error cuenta; los casos de varios intentos lo piden aparte
    rand: () => 0.999, // mantiene el orden
    ...over,
  }
  const user = userEvent.setup()
  render(<Practice {...props} />)
  const input = () => screen.getByRole('textbox', { name: /respuesta/i })
  return { props, user, input }
}

describe('Practice', () => {
  it('muestra la traducción y pide escribir la palabra en inglés', () => {
    setup()
    expect(screen.getByText('Aceptar')).toBeInTheDocument()
    expect(screen.getByText(/escribe en inglés/i)).toBeInTheDocument()
  })

  it('muestra el progreso con las palabras ya aprendidas', () => {
    setup({ alreadyDone: 3 })
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
  })

  it('una respuesta correcta se registra y pasa a la siguiente tarjeta', async () => {
    const { props, user, input } = setup()
    await user.type(input(), 'agree{Enter}')
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, true)
    expect(await screen.findByText('Fábrica')).toBeInTheDocument()
    expect(input()).toHaveValue('')
  })

  it('un error se registra, muestra la respuesta y exige escribirla para seguir', async () => {
    const { props, user, input } = setup()
    await user.type(input(), 'zzz{Enter}')
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, false)
    expect(screen.getByText('agree')).toBeInTheDocument()

    await user.type(input(), 'nope{Enter}')
    expect(screen.getByText('agree')).toBeInTheDocument()
    expect(screen.queryByText('Fábrica')).not.toBeInTheDocument()

    await user.type(input(), 'agree{Enter}')
    expect(await screen.findByText('Fábrica')).toBeInTheDocument()
    expect(props.onRecord).toHaveBeenCalledTimes(1) // copiar la respuesta no cuenta
  })

  it('un "casi" avisa, no registra y deja corregir', async () => {
    const { props, user, input } = setup()
    await user.type(input(), 'agre{Enter}')
    expect(screen.getByText(/casi/i)).toBeInTheDocument()
    expect(props.onRecord).not.toHaveBeenCalled()
    await user.clear(input())
    await user.type(input(), 'agree{Enter}')
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, true)
  })

  it('un sinónimo avisa cuál es la palabra buscada y no registra', async () => {
    const acute = w(5, 'acute', 'Agudo')
    const sharp = w(6, 'sharp', 'Agudo')
    const { props, user, input } = setup({ words: [acute], pool: [acute, sharp] })
    await user.type(input(), 'sharp{Enter}')
    expect(screen.getByText(/también vale/i)).toBeInTheDocument()
    expect(props.onRecord).not.toHaveBeenCalled()
  })

  it('al acertar todo llama a onFinish con las palabras falladas', async () => {
    const { props, user, input } = setup()
    await user.type(input(), 'zzz{Enter}') // falla agree
    await user.type(input(), 'agree{Enter}') // la copia
    await user.type(input(), 'factory{Enter}')
    await user.type(input(), 'agree{Enter}')
    expect(props.onFinish).toHaveBeenCalledExactlyOnceWith({ missed: [1], total: 2 })
  })

  it('en inglés → español acepta la traducción sin acentos', async () => {
    const { props, user, input } = setup({ direction: 'en_es', words: [factory] })
    expect(screen.getByText('factory')).toBeInTheDocument()
    await user.type(input(), 'fabrica{Enter}')
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(2, true)
  })

  it('con 3 intentos, un error avisa cuántos quedan y no revela la respuesta', async () => {
    const { props, user, input } = setup({ maxAttempts: 3 })
    await user.type(input(), 'zzz{Enter}')
    expect(screen.getByText(/te quedan 2 intentos/i)).toBeInTheDocument()
    expect(screen.queryByText('agree')).not.toBeInTheDocument()
    expect(props.onRecord).not.toHaveBeenCalled()
    expect(input()).toHaveValue('')
    await user.type(input(), 'zzz{Enter}')
    expect(screen.getByText(/te queda 1 intento\b/i)).toBeInTheDocument()
  })

  it('el tercer error revela la respuesta y registra un solo fallo', async () => {
    const { props, user, input } = setup({ maxAttempts: 3 })
    for (let i = 0; i < 3; i++) await user.type(input(), 'zzz{Enter}')
    expect(screen.getByText('agree')).toBeInTheDocument()
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, false)
  })

  it('acertar en el segundo intento se registra como acierto', async () => {
    const { props, user, input } = setup({ maxAttempts: 3 })
    await user.type(input(), 'zzz{Enter}')
    await user.type(input(), 'agree{Enter}')
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, true)
    expect(await screen.findByText('Fábrica')).toBeInTheDocument()
  })

  it('al copiar una respuesta con varias variantes, tal como se muestra, la acepta', async () => {
    const multi = w(7, 'agree', 'Aceptar, Acordar')
    const { user, input } = setup({ words: [multi], pool: [multi], direction: 'en_es' })
    await user.type(input(), 'zzz{Enter}') // falla y se revela "Aceptar, Acordar"
    expect(screen.getByText('Aceptar, Acordar')).toBeInTheDocument()
    await user.type(input(), 'Aceptar, Acordar{Enter}')
    expect(screen.queryByText('Aceptar, Acordar')).not.toBeInTheDocument()
    expect(screen.queryByText(/tal como aparece/i)).not.toBeInTheDocument()
  })

  it('Ctrl+Flecha izquierda vuelve a la palabra anterior y resta del avance', async () => {
    const { user, input } = setup()
    await user.type(input(), 'agree{Enter}')
    expect(await screen.findByText('Fábrica')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await user.keyboard('{Control>}{ArrowLeft}{/Control}')
    expect(screen.getByText('Aceptar')).toBeInTheDocument()
    expect(screen.getByText('0 / 2')).toBeInTheDocument()
  })

  it('sin palabra anterior, Ctrl+Flecha izquierda avisa y no cambia la tarjeta', async () => {
    const { user } = setup()
    await user.keyboard('{Control>}{ArrowLeft}{/Control}')
    expect(screen.getByText(/no hay una palabra anterior/i)).toBeInTheDocument()
    expect(screen.getByText('Aceptar')).toBeInTheDocument()
  })

  it('Ctrl+Mayús+D marca como difícil la palabra anterior, no la actual', async () => {
    const { props, user, input } = setup()
    await user.type(input(), 'agree{Enter}')
    await screen.findByText('Fábrica')
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}')
    expect(props.onMarkHard).toHaveBeenCalledExactlyOnceWith(1) // agree (la anterior), no factory
    expect(screen.getByText(/«agree» marcada como difícil/)).toBeInTheDocument()
  })

  it('Ctrl+Mayús+D sin palabra anterior avisa y no marca nada', async () => {
    const { props, user } = setup()
    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}')
    expect(props.onMarkHard).not.toHaveBeenCalled()
    expect(screen.getByText(/no hay una palabra anterior/i)).toBeInTheDocument()
  })

  it('Escape sale de la práctica', async () => {
    const { props, user } = setup()
    await user.keyboard('{Escape}')
    expect(props.onExit).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+D marca la palabra actual como difícil', async () => {
    const { props, user } = setup()
    await user.keyboard('{Control>}d{/Control}')
    expect(props.onMarkHard).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('Ctrl+Flecha derecha salta la tarjeta sin registrar', async () => {
    const { props, user } = setup()
    await user.keyboard('{Control>}{ArrowRight}{/Control}')
    expect(await screen.findByText('Fábrica')).toBeInTheDocument()
    expect(props.onRecord).not.toHaveBeenCalled()
  })

  it('Alt+P revela la primera letra como pista', async () => {
    const { user } = setup()
    expect(screen.queryByTestId('hint')).not.toBeInTheDocument()
    await user.keyboard('{Alt>}p{/Alt}')
    expect(screen.getByTestId('hint')).toHaveTextContent('a')
  })
})

describe('pausa del acierto (flashMs)', () => {
  const start = () => {
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) }) // Testing Library lo busca para avanzar los temporizadores
    vi.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const props: PracticeProps = {
      words: [agree, factory],
      alreadyDone: 0,
      direction: 'es_en',
      pool: [agree, factory],
      onRecord: vi.fn(),
      onMarkHard: vi.fn(),
      onFinish: vi.fn(),
      onExit: vi.fn(),
      maxAttempts: 1,
      flashMs: 600,
      rand: () => 0.999,
    }
    render(<Practice {...props} />)
    return { user, props }
  }
  const type = (user: ReturnType<typeof userEvent.setup>, text: string) =>
    user.type(screen.getByRole('textbox', { name: /respuesta/i }), text)

  it('muestra "Correcto" en la misma tarjeta y avanza solo al cumplirse flashMs', async () => {
    const { user } = start()
    await type(user, 'agree{Enter}')
    expect(screen.getByText('Correcto')).toBeInTheDocument()
    expect(screen.getByText('Aceptar')).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(599))
    expect(screen.getByText('Aceptar')).toBeInTheDocument() // aún no

    await act(async () => vi.advanceTimersByTime(1))
    expect(screen.getByText('Fábrica')).toBeInTheDocument()
    expect(screen.queryByText('Correcto')).not.toBeInTheDocument()
  })

  it('durante la pausa el campo no se puede editar', async () => {
    const { user } = start()
    await type(user, 'agree{Enter}')
    expect(screen.getByRole('textbox', { name: /respuesta/i })).toHaveAttribute('readonly')
  })

  it('Enter durante la pausa pasa a la siguiente sin esperar', async () => {
    const { user } = start()
    await type(user, 'agree{Enter}')
    await user.keyboard('{Enter}')
    expect(screen.getByText('Fábrica')).toBeInTheDocument()
  })

  it('no registra el acierto dos veces aunque se pulse Enter durante la pausa', async () => {
    const { user, props } = start()
    await type(user, 'agree{Enter}')
    await user.keyboard('{Enter}')
    await act(async () => vi.advanceTimersByTime(1000))
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, true)
  })
})

describe('Ver en contexto (oración con hueco)', () => {
  const ex = (word: Word, example_en: string): Word => ({ ...word, example_en, example_es: 'Una frase.' })
  const agreeEx = ex(agree, 'The students agree they have too much homework.')
  const factoryEx = ex(factory, 'The factory closed last year.')

  it('empieza oculta y Alt+C muestra la oración en inglés sin la palabra', async () => {
    const { user } = setup({ words: [agreeEx], pool: [agreeEx] })
    expect(screen.queryByTestId('context')).not.toBeInTheDocument()
    await user.keyboard('{Alt>}c{/Alt}')
    const block = screen.getByTestId('context')
    expect(block).toHaveTextContent('The students ______ they have too much homework.')
    expect(block).not.toHaveTextContent('agree')
  })

  it('el botón "Ver en contexto" hace lo mismo y Alt+C la vuelve a ocultar', async () => {
    const { user } = setup({ words: [agreeEx], pool: [agreeEx] })
    await user.click(screen.getByRole('button', { name: /ver en contexto/i }))
    expect(screen.getByTestId('context')).toBeInTheDocument()
    await user.keyboard('{Alt>}c{/Alt}')
    expect(screen.queryByTestId('context')).not.toBeInTheDocument()
  })

  it('se oculta al pasar a la siguiente tarjeta', async () => {
    const { user, input } = setup({ words: [agreeEx, factoryEx], pool: [agreeEx, factoryEx] })
    await user.keyboard('{Alt>}c{/Alt}')
    expect(screen.getByTestId('context')).toBeInTheDocument()
    await user.type(input(), 'agree{Enter}')
    expect(await screen.findByText('Fábrica')).toBeInTheDocument()
    expect(screen.queryByTestId('context')).not.toBeInTheDocument()
  })

  it('no ofrece el botón si la palabra no se puede ocultar (forma irregular): no se regala la respuesta', () => {
    const go = ex(w(9, 'go', 'Ir'), 'She went home.')
    setup({ words: [go], pool: [go] })
    expect(screen.queryByRole('button', { name: /ver en contexto/i })).not.toBeInTheDocument()
  })

  it('no ofrece el botón sin oración de ejemplo', () => {
    setup()
    expect(screen.queryByRole('button', { name: /ver en contexto/i })).not.toBeInTheDocument()
  })

  it('en inglés → español no aplica: la palabra en inglés ya se ve', () => {
    setup({ direction: 'en_es', words: [agreeEx], pool: [agreeEx] })
    expect(screen.queryByRole('button', { name: /ver en contexto/i })).not.toBeInTheDocument()
  })

  it('Alt+C sin oración que ocultar no hace nada', async () => {
    const { user } = setup()
    await user.keyboard('{Alt>}c{/Alt}')
    expect(screen.queryByTestId('context')).not.toBeInTheDocument()
  })
})

describe('pronunciación', () => {
  const press = '{Control>}{ }{/Control}'

  it('al acertar pronuncia la palabra en inglés', async () => {
    const onSpeak = vi.fn()
    const { user, input } = setup({ onSpeak })
    await user.type(input(), 'agree{Enter}')
    expect(onSpeak).toHaveBeenCalledExactlyOnceWith('agree')
  })

  it('al agotar los intentos y revelar la respuesta, la pronuncia', async () => {
    const onSpeak = vi.fn()
    const { user, input } = setup({ onSpeak })
    await user.type(input(), 'zzz{Enter}')
    expect(onSpeak).toHaveBeenCalledExactlyOnceWith('agree')
  })

  it('un error con intentos de sobra no pronuncia nada: sería regalar la respuesta', async () => {
    const onSpeak = vi.fn()
    const { user, input } = setup({ onSpeak, maxAttempts: 3 })
    await user.type(input(), 'zzz{Enter}')
    expect(onSpeak).not.toHaveBeenCalled()
  })

  it('Ctrl+Espacio repite lo último que sonó', async () => {
    const onSpeak = vi.fn()
    const { user, input } = setup({ onSpeak })
    await user.type(input(), 'agree{Enter}')
    await screen.findByText('Fábrica')
    await user.keyboard(press)
    expect(onSpeak).toHaveBeenCalledTimes(2)
    expect(onSpeak).toHaveBeenLastCalledWith('agree')
  })

  it('en español → inglés, Ctrl+Espacio no pronuncia la respuesta de la tarjeta que aún no resolviste', async () => {
    const onSpeak = vi.fn()
    const { user } = setup({ onSpeak })
    await user.keyboard(press)
    expect(onSpeak).not.toHaveBeenCalled()
  })

  it('en inglés → español, Ctrl+Espacio pronuncia la palabra que ya se ve', async () => {
    const onSpeak = vi.fn()
    const { user } = setup({ onSpeak, direction: 'en_es', words: [factory], pool: [factory] })
    await user.keyboard(press)
    expect(onSpeak).toHaveBeenCalledExactlyOnceWith('factory')
  })

  it('con la respuesta revelada, Ctrl+Espacio la pronuncia otra vez', async () => {
    const onSpeak = vi.fn()
    const { user, input } = setup({ onSpeak })
    await user.type(input(), 'zzz{Enter}')
    await user.keyboard(press)
    expect(onSpeak).toHaveBeenCalledTimes(2)
  })

  it('sin la función de pronunciar, todo sigue funcionando', async () => {
    const { user, input, props } = setup()
    await user.type(input(), 'agree{Enter}')
    await user.keyboard(press)
    expect(props.onRecord).toHaveBeenCalledExactlyOnceWith(1, true)
  })
})

describe('lista de atajos (pie de la práctica)', () => {
  afterEach(() => localStorage.clear())
  const keys = () => screen.getByRole('list', { name: /atajos de teclado/i })

  it('por defecto solo muestra los esenciales: Enter y Esc', () => {
    setup()
    expect(keys()).toHaveTextContent('Comprobar')
    expect(keys()).toHaveTextContent('Salir')
    for (const hidden of ['Pista', 'Contexto', 'Pronunciar', 'Anterior', 'Saltar', 'Marcar difícil']) {
      expect(keys()).not.toHaveTextContent(hidden)
    }
  })

  it('"Más atajos" despliega todos y "Menos atajos" los vuelve a esconder', async () => {
    const { user } = setup()
    const toggle = screen.getByRole('button', { name: /más atajos/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    for (const label of ['Pista', 'Contexto', 'Pronunciar', 'Anterior', 'Saltar', 'Marcar difícil', 'Anterior difícil']) {
      expect(keys()).toHaveTextContent(label)
    }
    expect(screen.getByRole('button', { name: /menos atajos/i })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: /menos atajos/i }))
    expect(keys()).not.toHaveTextContent('Pista')
  })

  it('recuerda tu elección la próxima vez que se abra la práctica', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /más atajos/i }))
    cleanup()
    setup()
    expect(keys()).toHaveTextContent('Pista')
    expect(screen.getByRole('button', { name: /menos atajos/i })).toBeInTheDocument()
  })

  it('los atajos funcionan aunque la lista esté recogida', async () => {
    const { user, props } = setup()
    await user.keyboard('{Control>}d{/Control}')
    expect(props.onMarkHard).toHaveBeenCalledExactlyOnceWith(1)
  })
})
