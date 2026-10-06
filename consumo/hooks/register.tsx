import { atom, read, update } from 'claude-code'
import type { Register, SessionMeasureInput } from 'claude-code'

import type { Medicion } from '../types'
import {
  TOKENS_VACIOS,
  anchoBarra,
  barra,
  hhmm,
  lineaEstado,
  miles,
  nivel,
  nombreVentana,
  ordenarVentanas,
  pct,
  porcentajeCache,
  reinicio,
  resumenTexto,
  sumarTurno,
  usd,
} from './lib/formato'

const PANEL = 'consumo'

const medicion = atom({ plugin: 'consumo', key: 'medicion' } as const, null)
const tokens = atom({ plugin: 'consumo', key: 'tokens' } as const, TOKENS_VACIOS)
/** Se actualiza cada minuto para que "en 2 h 05 min" no quede viejo. */
const ahora = atom({ plugin: 'consumo', key: 'ahora' } as const, 0)

type Cifras = Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>

/** Pasa las cifras del motor a la forma guardada, sin claves `undefined`. */
const aMedicion = (u: Cifras, tomadaEn: number): Medicion => {
  const contexto: Medicion['contexto'] = { ventana: u.context.window }
  if (u.context.tokens !== undefined) contexto.tokens = u.context.tokens
  if (u.context.percent !== undefined) contexto.porcentaje = u.context.percent
  const m: Medicion = {
    contexto,
    limites: u.rateLimits.map(r =>
      r.resetsAt === undefined
        ? { kind: r.kind, percentUsed: r.percentUsed }
        : { kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt },
    ),
    tomadaEn,
  }
  if (u.cost !== undefined) m.costoUsd = u.cost.usd
  return m
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'consumo',
      description: 'Panel de consumo: límites del plan, contexto, costo y tokens. "/consumo cerrar" lo cierra.',
    })

    // Primera lectura (gratis: sin desglose). Antes de la primera respuesta
    // los límites vienen vacíos; se llenan con session.measure.
    const t = await $.clock.now()
    await update($, ahora, () => t)
    try {
      const m = aMedicion(await $.session.usage(), t)
      await update($, medicion, () => m)
      $.ui.status(lineaEstado(m))
    } catch {
      // Sin lectura inicial: la barra se llena con el primer session.measure.
    }

    $.clock.every(60_000, async () => {
      const n = await $.clock.now()
      await update($, ahora, () => n)
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const m = aMedicion(e, await $.clock.now())
    await update($, medicion, () => m)
    $.ui.status(lineaEstado(m))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const uso = e.usage
    if (uso !== undefined) await update($, tokens, t => sumarTurno(t, uso))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // /clear empieza una sesión nueva: los tokens parten de cero.
    if (e.reason === 'clear') await update($, tokens, () => TOKENS_VACIOS)

    return next(e)
  })

  on('command.run', { command: 'consumo' }, async ($, e) => {
    if (e.args.trim() === 'cerrar') {
      await $.ui.close({ id: PANEL })
      return { text: 'Panel de consumo cerrado.' }
    }

    const abierto = await $.ui.open({ id: PANEL, title: 'Consumo' })
    if (abierto.isPlaced) return { text: 'Panel de consumo abierto. "/consumo cerrar" lo cierra.' }

    // Si el panel no cabe, al menos las cifras en texto.
    const texto = resumenTexto(await read($, medicion), await read($, tokens), await $.clock.now())
    return { text: `${texto}\n(El panel no se pudo mostrar: ${abierto.reason})` }
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, medicion)
    const t = await read($, tokens)
    await read($, ahora) // suscribe el panel al tic de cada minuto
    const n = await $.clock.now()
    const ancho = anchoBarra(e.props.bodyColumns - 2)
    const limites = m === null ? [] : ordenarVentanas(m.limites)
    const ctx = m?.contexto
    const cache = porcentajeCache(t)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>Límites del plan</Text>
        {limites.length === 0 && (
          <Box key="limites-vacio">
            <Text dimColor>Sin datos aún: llegan con la primera respuesta.</Text>
          </Box>
        )}
        {limites.map(v => (
          <Box key={`limite-${v.kind}`} flexDirection="column">
            <Box gap={1}>
              <Text>{nombreVentana(v.kind).padEnd(8)}</Text>
              <Text color={nivel(v.percentUsed)}>{barra(v.percentUsed, ancho)}</Text>
              <Text bold>{pct(v.percentUsed)}</Text>
            </Box>
            {reinicio(v, n) !== '' && <Text dimColor>{`         se reinicia ${reinicio(v, n)}`}</Text>}
          </Box>
        ))}

        <Box marginTop={1} flexDirection="column">
          <Text bold>Contexto</Text>
          {ctx?.porcentaje === undefined ? (
            <Box key="contexto-vacio">
              <Text dimColor>Sin datos aún.</Text>
            </Box>
          ) : (
            <Box key="contexto" flexDirection="column">
              <Box gap={1}>
                <Text color={nivel(ctx.porcentaje)}>{barra(ctx.porcentaje, ancho + 9)}</Text>
                <Text bold>{pct(ctx.porcentaje)}</Text>
              </Box>
              <Text dimColor>{`${miles(ctx.tokens ?? 0)} / ${miles(ctx.ventana)} tokens`}</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold>Sesión</Text>
          {m?.costoUsd !== undefined && (
            <Box key="costo" flexDirection="column">
              <Text>{`Costo equivalente API: ${usd(m.costoUsd)}`}</Text>
              <Text dimColor>Con Pro no es lo que pagas; sirve para comparar.</Text>
            </Box>
          )}
          <Box key="tokens">
            <Text>{`Tokens: entrada ${miles(t.entrada)} · salida ${miles(t.salida)}`}</Text>
          </Box>
          <Box key="cache">
            <Text>
              {`Caché: leída ${miles(t.cacheLeida)} · escrita ${miles(t.cacheEscrita)}` +
                (cache === undefined ? '' : ` (${pct(cache)} desde caché)`)}
            </Text>
          </Box>
          <Box key="turnos">
            <Text>{`Turnos: ${t.turnos}`}</Text>
          </Box>
        </Box>

        {m !== null && (
          <Box marginTop={1}>
            <Text dimColor>{`Actualizado ${hhmm(m.tomadaEn)}`}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
