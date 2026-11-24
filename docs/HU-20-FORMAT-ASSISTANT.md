# HU-20 - Catálogo y asistente de formato

## Implementado

- [x] Catálogo de los siete formatos con una tarjeta por formato.
- [x] Cantidad de equipos real cargada desde la base y editable para simular escenarios.
- [x] Duración de partido editable; la duración estimada usa partido más descanso configurado.
- [x] Parámetros sugeridos, partidos totales, mínimo por equipo y advertencias.
- [x] Formatos no viables deshabilitados con el motivo en español.
- [x] Comparación lado a lado de hasta tres formatos.
- [x] Selección persistida en el torneo sin generar fixture.
- [x] Cálculos puros exportados desde `domain/` y cubiertos con los casos de referencia.

## Cómo verificarlo

1. Ejecutá `npm start`.
2. Abrí el panel y elegí **Formato**.
3. Cambiá la cantidad de equipos o la duración del partido.
4. Marcá hasta tres formatos en **Comparar**.
5. Elegí un formato y presioná **Guardar formato**.
6. Volvé a abrir la pantalla y confirmá que la selección se conserva; no se genera ningún partido.

## Tests

Se agregó `src/domain/format-options.spec.ts`, incluyendo round robin, grupos con eliminación,
copas, eliminación directa, cruces de posiciones, suizo, doble eliminación, byes, grupos
desparejos y formatos no viables.

## Validación completa

```text
npm run lint
All files pass linting.

npm test
Test Files 17 passed (17)
Tests 86 passed (86)

npm run build
Application bundle generation complete.
```

El build mantiene los warnings conocidos de tamaño del bundle y CommonJS de PapaParse, pero
finaliza correctamente.

## Decisiones y pendientes

- Los byes no se cuentan como partidos jugados: el total de una llave con `n` participantes es
  `n - 1`, aunque el tamaño técnico de la llave sea una potencia de dos.
- Se eligieron parámetros iniciales conservadores: una vuelta, dos grupos cuando corresponde,
  dos clasificados por grupo y la cantidad mínima de rondas suizas que cubre `ceil(log2(n))`.
- HU-21 queda responsable de editar y validar parámetros más allá de estas sugerencias.
