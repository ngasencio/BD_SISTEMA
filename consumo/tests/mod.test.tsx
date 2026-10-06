import type { On, SessionMeasureInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

// 2026-10-06 12:00 UTC; la ventana de 5 horas se reinicia 2 h 05 min después.
const AHORA = Date.UTC(2026, 9, 6, 12, 0)
const REINICIO_5H = new Date(AHORA + 125 * 60_000).toISOString()

const PANEL = {
  plugin: 'consumo',
  component: 'Pane',
  requestId: 'consumo',
  props: {
    title: 'Consumo',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const MEDICION: SessionMeasureInput = {
  context: { tokens: 122_000, window: 200_000, percent: 61 },
  rateLimits: [
    { kind: 'seven_day', percentUsed: 18 },
    { kind: 'five_hour', percentUsed: 42, resetsAt: REINICIO_5H },
  ],
  cost: { usd: 1.234 },
  changed: ['context', 'rateLimits', 'cost'],
}

const USO = {
  input_tokens: 1_000,
  output_tokens: 500,
  cache_read_input_tokens: 8_000,
  cache_creation_input_tokens: 1_000,
  model: 'claude-test',
}

/** Lo que el motor contestaría bajo el plugin: reloj fijo, estado y eventos. */
const motor = (on: On) => {
  mock.clock(on, { now: AHORA })
  on('ui.status', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.end', () => ({ sessionId: 'test' }))
}

describe('consumo', () => {
  test('cada medición actualiza la barra de estado', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const estados: (string | undefined)[] = []
    on('ui.status', (_$, e) => {
      estados.push(e.text)
      return { value: undefined }
    })
    on('session.measure', (_$, e) => ({ changed: e.changed }))

    await $.session.measure(MEDICION)

    expect(estados.at(-1)).toBe('5h 42% · 7d 18% · ctx 61%')
  })

  test('el panel muestra límites, contexto, costo y tokens en cada superficie', async ($, on) => {
    motor(on)

    await $.session.measure(MEDICION)
    for (let i = 0; i < 2; i++) {
      await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: `t${i}`, reason: 'answer', usage: USO })
    }

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANEL, surface })
      expect(await ui.find({ type: 'Text', text: '5 horas' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /en 2 h 05 min/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '7 días' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '122.000 / 200.000 tokens' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Costo equivalente API: US$ 1,23' })).toBeDefined()
      expect((await ui.find({ key: 'tokens' }))?.text).toBe('Tokens: entrada 2.000 · salida 1.000')
      expect((await ui.find({ key: 'cache' }))?.text).toBe('Caché: leída 16.000 · escrita 2.000 (80% desde caché)')
      expect((await ui.find({ key: 'turnos' }))?.text).toBe('Turnos: 2')
      await ui.unmount()
    }
  })

  test('5 horas aparece antes que 7 días aunque la API las mande al revés', async ($, on) => {
    motor(on)
    await $.session.measure(MEDICION)

    const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
    const nombres = (await ui.findAll({ type: 'Text', text: /^(5 horas|7 días)/ })).map(t => t.text.trim())
    expect(nombres).toEqual(['5 horas', '7 días'])
    await ui.unmount()
  })

  test('sin datos el panel lo dice en vez de mostrar ceros', async ($, on) => {
    motor(on)
    const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
    expect(await ui.find({ key: 'limites-vacio' })).toBeDefined()
    expect(await ui.find({ key: 'contexto-vacio' })).toBeDefined()
    expect(await ui.find({ key: 'costo' })).toBeUndefined()
    await ui.unmount()
  })

  test('/clear deja los tokens en cero', async ($, on) => {
    motor(on)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: USO })
    const antes = await $.ui.mount({ ...PANEL, surface: 'terminal' })
    expect((await antes.find({ key: 'turnos' }))?.text).toBe('Turnos: 1')
    await antes.unmount()
    await $.session.end({ reason: 'clear', resume: { id: 'x' } } as never)

    const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
    expect((await ui.find({ key: 'turnos' }))?.text).toBe('Turnos: 0')
    await ui.unmount()
  })

  test('al iniciar registra /consumo y pone la barra de estado con lo que ya hay', async ($, on) => {
    mock.clock(on, { now: AHORA })
    const comandos: string[] = []
    const estados: (string | undefined)[] = []
    on('command.register', (_$, e) => {
      comandos.push(e.name)
      return { value: { command: e.name } }
    })
    on('ui.status', (_$, e) => {
      estados.push(e.text)
      return { value: undefined }
    })
    on('session.usage', () => ({
      value: {
        startedAt: AHORA,
        context: { window: 200_000, tokens: 20_000, percent: 10 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 5 }],
      },
    }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/proyecto', surface: 'terminal', isInteractive: true })

    expect(comandos).toEqual(['consumo'])
    expect(estados.at(-1)).toBe('5h 5% · ctx 10%')
  })

  test('/consumo abre el panel, y si no cabe responde las cifras en texto', async ($, on) => {
    motor(on)
    let cabe = true
    on('ui.open', () => ({ value: cabe ? { isPlaced: true } : { isPlaced: false, reason: 'terminal angosta' } }))
    on('ui.close', () => ({ value: undefined }))
    await $.session.measure(MEDICION)
    const correr = (args: string) =>
      $.command.run({
        command: 'consumo',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 80 },
      })

    expect((await correr('')).text).toContain('Panel de consumo abierto')
    cabe = false
    const texto = (await correr('')).text ?? ''
    expect(texto).toContain('5 horas: 42%')
    expect(texto).toContain('terminal angosta')
    expect((await correr('cerrar')).text).toBe('Panel de consumo cerrado.')
  })
})
