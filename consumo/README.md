# consumo — tablero de consumo para Claude Code (etapa 1)

Muestra en Claude Code:

- **Barra de estado** (siempre): `5h 42% · 7d 18% · ctx 61%`
- **Panel** con `/consumo`: límites del plan (5 horas y 7 días, % y hora de reinicio), ventana de contexto, costo equivalente API y tokens de la sesión. `/consumo cerrar` lo cierra.

## Cargarlo (Windows, terminal)

Una sesión:

    claude --plugin-dir "C:\Users\usuario\Desktop\BD_SISTEMA\consumo"

Siempre: en `C:\Users\usuario\.claude\settings.json`, dentro de `"env"`:

    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\usuario\\Desktop\\BD_SISTEMA\\consumo"

## Notas

- El costo en USD es a precio de API: con suscripción Pro no es lo que pagas.
- Los límites de 5 h / 7 días llegan con la primera respuesta de la sesión.
- La API de mods está en acceso anticipado; probado con Claude Code 2.1.291.

## Verificar

    claude plugin validate "C:\Users\usuario\Desktop\BD_SISTEMA\consumo"
