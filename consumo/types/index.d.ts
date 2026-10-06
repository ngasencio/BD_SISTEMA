/** Una ventana de límite del plan, tal como la reportó la última respuesta. */
export type VentanaLimite = {
  /** `five_hour`, `seven_day` o `spend_limit` (u otra que agregue la API). */
  kind: string
  /** 0 a 100. */
  percentUsed: number
  /** ISO 8601. */
  resetsAt?: string
}

/** La última medición de la sesión (evento `session.measure`). */
export type Medicion = {
  contexto: { tokens?: number; ventana: number; porcentaje?: number }
  limites: VentanaLimite[]
  /** USD equivalentes a precio de API; con suscripción no es lo que se paga. */
  costoUsd?: number
  /** Milisegundos desde epoch en que se tomó. */
  tomadaEn: number
}

/** Tokens sumados de todos los turnos de la sesión (hilo principal y subagentes). */
export type TokensSesion = {
  entrada: number
  salida: number
  cacheLeida: number
  cacheEscrita: number
  turnos: number
}

declare module 'claude-code' {
  interface PluginState {
    consumo: {
      medicion: Medicion | null
      tokens: TokensSesion
      ahora: number
    }
  }
}
