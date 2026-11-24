# HU-19 - Goal scorers

## Implementado

- [x] Ranking derivado por jugador con equipo, tries, conversiones y puntos.
- [x] Puntos calculados como 5 por try y 2 por conversión.
- [x] Orden por puntos, luego tries, apellido, nombre y un desempate técnico estable por ID.
- [x] Eventos sin autor excluidos de las filas y tries sin autor contados en `unattributedTries`.
- [x] Eventos de partidos `DIRECT` o `WALKOVER` excluidos.
- [x] Filtros derivados por categoría y género.
- [x] Los homónimos conservan su identidad individual mediante `playerId`; la aclaración visible
      sigue siendo responsabilidad de la pantalla que renderiza el jugador.
- [x] El cálculo no persiste estado y se exporta desde el API público de `domain/`.

## Tests

Se agregó `src/domain/scorers.spec.ts` con el caso de referencia de
`docs/REFERENCE_CASES.md`, exclusión de eventos sin autor y partidos directos/W.O., filtros y
desempate por apellido.

## Verificación manual

La pantalla `/panel/goleadores` todavía no existe: la ruta y la UI dependen de las pantallas de
fixture y control de partidos posteriores. Cuando estén disponibles:

1. Abrí el panel y navegá a Goleadores.
2. Confirmá las pestañas de puntos, tries y conversiones.
3. Verificá que categoría y género filtren la tabla.
4. Registrá un try sin autor y comprobá la nota informativa.
5. Confirmá que un partido directo o W.O. no modifique la tabla.
6. Usá dos homónimos y verificá que cada uno conserve su aclaración.

## Validación completa

```text
npm run lint
All files pass linting.

npm test
Test Files  16 passed (16)
Tests       81 passed (81)

npm run build
Application bundle generation complete.
```

El build mantiene los warnings preexistentes de tamaño del bundle y CommonJS de PapaParse, pero
finaliza correctamente.

## Decisiones y pendientes

- Se implementó solo el cálculo de dominio, siguiendo el alcance de HU-15 y HU-16, porque todavía
  no existe una pantalla de fixture/control de partidos que pueda alimentar una tabla útil.
- Los tries sin autor se cuentan sin aplicar filtros de jugador: al no tener autor, no hay categoría
  ni género confiable para clasificarlos.
- Se excluyen también eventos cuyo `definition` es `WALKOVER`, aunque el contrato ya los identifica
  normalmente mediante `mode`, para proteger la regla ante snapshots inconsistentes.
