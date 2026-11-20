# HU-13 calculadora de capacidad de equipos

## Implementado

- Función pura `computeCapacity` en `src/domain/capacity.ts`.
- Calcula el rango de equipos posibles según el mínimo y máximo configurados.
- Devuelve el reparto de jugadores por equipo, con diferencias de como máximo un jugador.
- Informa correctamente cuando no existe ninguna cantidad válida de equipos.
- Soporta un máximo de plantel ilimitado (`max: null`).
- Exportación desde `src/domain/index.ts`.

## Tests

- Casos de referencia para 120, 53, 14 y 7 jugadores.
- Casos sin cantidad válida para 6 y 13 jugadores.
- Validación de límites inválidos y máximo ilimitado.
- Suite completa: 50 tests aprobados.

## Verificación manual

1. Abrir la pantalla de armado de equipos cuando esté integrada la UI de HU-13.
2. Ingresar la cantidad de jugadores y los límites mínimo y máximo.
3. Confirmar que se muestra el rango de equipos posibles.
4. Revisar que cada opción muestre planteles que difieren como máximo en un jugador.
5. Confirmar el mensaje de que no alcanza para un equipo cuando hay menos jugadores que el mínimo.
