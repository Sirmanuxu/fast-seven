# HU-18 — Comparación entre grupos y grupos desparejos

## Implementado

- [x] Compara una misma posición entre grupos por puntos de tabla, diferencia de puntos, puntos a favor y tries a favor.
- [x] Omite resultado directo al comparar grupos.
- [x] En grupos más grandes, descarta todos los partidos contra el último equipo de cada grupo, determinado por su tabla completa y sus desempates.
- [x] Devuelve los identificadores de los partidos descartados para que la UI pueda mostrarlos.
- [x] Marca la comparación como provisoria mientras exista un partido de grupo no finalizado.
- [x] Agrega casos de prueba para configuraciones 4-4-3 y 5-4-4-4, además del estado provisorio.

## Verificación

```text
npm run lint
npm test
npm run build
```

Resultado: los tres comandos pasan. El build mantiene los warnings preexistentes del presupuesto inicial y de `papaparse` CommonJS.

La API implementada es `compareAcrossGroups` en `src/domain/compare-across-groups.ts`. La vista «Tabla comparativa» todavía no existe en la aplicación actual; `excludedMatchIds` y `isProvisional` dejan preparados los datos para la pantalla de posiciones.

## Decisiones

- La comparación usa exclusivamente los cuatro criterios indicados por HU-18 y no aplica `HEAD_TO_HEAD`, `BUCHHOLZ` ni `DRAW` entre grupos.
- Cuando los cuatro valores son iguales, se conserva el orden de los grupos y de sus tablas de origen para mantener un resultado determinista sin introducir un sorteo nuevo.
