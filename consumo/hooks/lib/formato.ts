// Lógica pura del tablero: sin `$`, para poder testearla sola.
import type { Medicion, TokensSesion, VentanaLimite } from '../../types'

export type Nivel = 'success' | 'warning' | 'error'

export const TOKENS_VACIOS: TokensSesion = {
  entrada: 0,
  salida: 0,
  cacheLeida: 0,
  cacheEscrita: 0,
  turnos: 0,
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Color según qué tan cerca está del tope: <70 verde, 70-89 amarillo, ≥90 rojo. */
export const nivel = (porcentaje: number): Nivel =>
  porcentaje >= 90 ? 'error' : porcentaje >= 70 ? 'warning' : 'success'

/** Barra de texto de `ancho` celdas. */
export const barra = (porcentaje: number, ancho: number): string => {
  const llenas = Math.round((acotar(porcentaje, 0, 100) / 100) * ancho)
  return '█'.repeat(llenas) + '░'.repeat(ancho - llenas)
}

/** 12300 → "12.300" (separador de miles chileno). */
export const miles = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** 1.234 → "US$ 1,23". */
export const usd = (n: number): string => {
  const [entero = '0', dec = '00'] = n.toFixed(2).split('.')
  return `US$ ${miles(Number(entero))},${dec}`
}

/** 42 → "42%", 23.5 → "23,5%". */
export const pct = (n: number): string => `${String(Math.round(n * 10) / 10).replace('.', ',')}%`

export const nombreVentana = (kind: string): string =>
  kind === 'five_hour'
    ? '5 horas'
    : kind === 'seven_day'
      ? '7 días'
      : kind === 'spend_limit'
        ? 'Límite de gasto'
        : kind

export const abreviaturaVentana = (kind: string): string =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind === 'spend_limit' ? 'gasto' : kind

/** Tiempo que falta: "en 2 h 05 min", "en 3 d 4 h", "en 12 min", "ya". */
export const faltan = (hastaMs: number, ahoraMs: number): string => {
  const min = Math.ceil((hastaMs - ahoraMs) / 60000)
  if (min <= 0) return 'ya'
  if (min < 60) return `en ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `en ${horas} h ${String(min % 60).padStart(2, '0')} min`
  return `en ${Math.floor(horas / 24)} d ${horas % 24} h`
}

/** Hora local del reinicio: "15:40" si es hoy, "lun 13 oct 09:00" si no. */
export const horaReinicio = (hastaMs: number, ahoraMs: number): string => {
  const d = new Date(hastaMs)
  const hoy = new Date(ahoraMs)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const esHoy =
    d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()
  return esHoy ? hhmm : `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${hhmm}`
}

/** "15:40 (en 2 h 05 min)", o "" si la API no informó el reinicio. */
export const reinicio = (v: VentanaLimite, ahoraMs: number): string => {
  if (v.resetsAt === undefined) return ''
  const ms = Date.parse(v.resetsAt)
  if (Number.isNaN(ms)) return ''
  return `${horaReinicio(ms, ahoraMs)} (${faltan(ms, ahoraMs)})`
}

/** 5 horas primero, luego 7 días, luego el resto en el orden recibido. */
export const ordenarVentanas = (limites: readonly VentanaLimite[]): VentanaLimite[] => {
  const peso = (k: string) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : 2)
  return [...limites].sort((a, b) => peso(a.kind) - peso(b.kind))
}

/** Texto corto para la barra de estado: "5h 42% · 7d 18% · ctx 61%". */
export const lineaEstado = (m: Medicion | null): string | undefined => {
  if (m === null) return undefined
  const partes = ordenarVentanas(m.limites).map(v => `${abreviaturaVentana(v.kind)} ${pct(v.percentUsed)}`)
  if (m.contexto.porcentaje !== undefined) partes.push(`ctx ${pct(m.contexto.porcentaje)}`)
  if (partes.length === 0 && m.costoUsd !== undefined && m.costoUsd > 0) partes.push(usd(m.costoUsd))
  return partes.length === 0 ? undefined : partes.join(' · ')
}

/** Uso de un turno, con los nombres de la API. */
export type UsoTurno = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const sumarTurno = (t: TokensSesion, u: UsoTurno): TokensSesion => ({
  entrada: t.entrada + u.input_tokens,
  salida: t.salida + u.output_tokens,
  cacheLeida: t.cacheLeida + u.cache_read_input_tokens,
  cacheEscrita: t.cacheEscrita + u.cache_creation_input_tokens,
  turnos: t.turnos + 1,
})

/** % de la entrada que vino de caché (más alto = más barato). */
export const porcentajeCache = (t: TokensSesion): number | undefined => {
  const total = t.entrada + t.cacheLeida + t.cacheEscrita
  return total === 0 ? undefined : (t.cacheLeida / total) * 100
}

/** Ancho de las barras según el ancho del panel. */
export const anchoBarra = (columnas: number | undefined): number => acotar((columnas ?? 60) - 34, 8, 30)

/** Hora local "14:32". */
export const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** El mismo contenido del panel en texto plano (respaldo si el panel no cabe). */
export const resumenTexto = (m: Medicion | null, t: TokensSesion, ahoraMs: number): string => {
  const l: string[] = []
  const limites = m === null ? [] : ordenarVentanas(m.limites)
  if (limites.length === 0) l.push('Límites del plan: sin datos aún (llegan con la primera respuesta).')
  for (const v of limites) {
    const r = reinicio(v, ahoraMs)
    l.push(`${nombreVentana(v.kind)}: ${pct(v.percentUsed)}${r === '' ? '' : ` · se reinicia ${r}`}`)
  }
  const c = m?.contexto
  l.push(
    c?.porcentaje === undefined
      ? 'Contexto: sin datos aún.'
      : `Contexto: ${pct(c.porcentaje)} (${miles(c.tokens ?? 0)} / ${miles(c.ventana)} tokens)`,
  )
  if (m?.costoUsd !== undefined) l.push(`Costo equivalente API: ${usd(m.costoUsd)} (con Pro no es lo que pagas)`)
  l.push(`Tokens: entrada ${miles(t.entrada)} · salida ${miles(t.salida)} · caché leída ${miles(t.cacheLeida)} · caché escrita ${miles(t.cacheEscrita)}`)
  l.push(`Turnos: ${t.turnos}`)
  return l.join('\n')
}
