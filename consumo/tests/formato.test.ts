import { describe, expect, test } from 'claude-code/testing'

import {
  TOKENS_VACIOS,
  barra,
  faltan,
  lineaEstado,
  miles,
  nivel,
  pct,
  porcentajeCache,
  resumenTexto,
  sumarTurno,
  usd,
} from '../hooks/lib/formato'

describe('formatos', () => {
  test('números al estilo chileno', async () => {
    expect(miles(0)).toBe('0')
    expect(miles(12300)).toBe('12.300')
    expect(miles(1234567)).toBe('1.234.567')
    expect(usd(1.234)).toBe('US$ 1,23')
    expect(usd(1234.5)).toBe('US$ 1.234,50')
    expect(pct(42)).toBe('42%')
    expect(pct(23.5)).toBe('23,5%')
  })

  test('barra y nivel', async () => {
    expect(barra(50, 10)).toBe('█████░░░░░')
    expect(barra(150, 4)).toBe('████')
    expect(barra(-5, 4)).toBe('░░░░')
    expect(nivel(69)).toBe('success')
    expect(nivel(70)).toBe('warning')
    expect(nivel(90)).toBe('error')
  })

  test('tiempo restante', async () => {
    const min = 60_000
    expect(faltan(0, 10)).toBe('ya')
    expect(faltan(12 * min, 0)).toBe('en 12 min')
    expect(faltan(125 * min, 0)).toBe('en 2 h 05 min')
    expect(faltan((3 * 24 + 4) * 60 * min, 0)).toBe('en 3 d 4 h')
  })
})

describe('línea de estado', () => {
  test('sin medición no muestra nada', async () => {
    expect(lineaEstado(null)).toBeUndefined()
  })

  test('5 horas primero, luego 7 días y contexto', async () => {
    const linea = lineaEstado({
      contexto: { ventana: 200_000, tokens: 122_000, porcentaje: 61 },
      limites: [
        { kind: 'seven_day', percentUsed: 18 },
        { kind: 'five_hour', percentUsed: 42 },
      ],
      costoUsd: 1.2,
      tomadaEn: 0,
    })
    expect(linea).toBe('5h 42% · 7d 18% · ctx 61%')
  })

  test('antes de la primera respuesta no muestra US$ 0,00', async () => {
    expect(lineaEstado({ contexto: { ventana: 200_000 }, limites: [], costoUsd: 0, tomadaEn: 0 })).toBeUndefined()
  })
})

describe('tokens de la sesión', () => {
  test('suma turnos y calcula % desde caché', async () => {
    const uso = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 100 }
    const t = sumarTurno(sumarTurno(TOKENS_VACIOS, uso), uso)
    expect(t).toEqual({ entrada: 200, salida: 100, cacheLeida: 1600, cacheEscrita: 200, turnos: 2 })
    expect(porcentajeCache(t)).toBe(80)
    expect(porcentajeCache(TOKENS_VACIOS)).toBeUndefined()
  })

  test('resumen en texto sin datos', async () => {
    const r = resumenTexto(null, TOKENS_VACIOS, 0)
    expect(r).toContain('Límites del plan: sin datos aún')
    expect(r).toContain('Turnos: 0')
  })
})
