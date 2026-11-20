# HU-14 configuración de reglas del torneo

## Implementado

- Pantalla de reglas disponible en `/#/panel/reglas`.
- Edición del nombre y la fecha del torneo.
- Presets de puntos `3-2-1`, `4-2-0 con bonus` y configuración personalizada.
- Configuración de bonus ofensivo y bonus defensivo.
- Configuración del marcador de W.O. y del tratamiento del bye.
- Orden reordenable de desempates, con el sorteo fijo al final.
- Disponibilidad de Buchholz únicamente para torneos suizos.
- Configuración de mínimo y máximo de jugadores por equipo.
- Configuración de hora de inicio, duración de partidos y descanso.
- Validación de enteros no negativos y del orden de límites de plantel.
- Aviso no bloqueante cuando la victoria vale menos que el empate.
- Aviso de recálculo al modificar puntos durante un torneo en curso.
- Persistencia atómica de nombre, fecha, reglas y cronograma.
- El botón «Guardar reglas» vuelve al panel después de guardar correctamente.
- Los errores se muestran mediante un popup nativo reemplazable por un modal futuro.

## Tests

- Suite completa: 54 tests aprobados.
- Lint aprobado.
- Build de producción aprobado.

El build mantiene únicamente los warnings existentes de presupuesto del bundle y de
`papaparse` CommonJS.

## Verificación manual

1. Abrir `/#/panel/reglas`.
2. Cambiar el preset de puntos y verificar que se actualicen los campos.
3. Elegir «Personalizado» y modificar puntos y bonus.
4. Reordenar los desempates y confirmar que «Sorteo» permanezca último.
5. Verificar que Buchholz solo aparezca con formato suizo.
6. Configurar W.O., bye, límites de plantel y tiempos.
7. Ingresar valores inválidos y confirmar que aparezca un popup, sin texto de error inline.
8. Guardar y confirmar que se vuelva a `/#/panel`.
9. Recargar la aplicación y verificar que los valores persistan.

## Decisiones y pendientes

- El cambio de puntos durante `RUNNING` muestra el aviso de recálculo, pero el flujo
  interactivo de partidos afectados queda para HU-38.
- Los popups usan `window.alert` a través de `src/app/error-popup.ts`; ese helper es el
  punto de sustitución para el futuro modal personalizado.
