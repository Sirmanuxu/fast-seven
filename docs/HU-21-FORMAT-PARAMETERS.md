# HU-21 - Parámetros del formato y validaciones

## Implementado

- [x] Cada formato aplica sus parámetros editables y recalcula partidos totales, mínimos y máximos por equipo y duración.
- [x] Los formatos con grupos ofrecen el reparto sugerido y alternativas válidas.
- [x] El reparto 11 equipos / 3 grupos muestra 4-4-3 y ofrece alternativas como 6-5.
- [x] Los grupos desparejos muestran la explicación de comparación según HU-18.
- [x] Los clasificados por grupo se validan contra el grupo más chico.
- [x] Los byes muestran la cantidad y aclaran que los reciben los equipos mejor sembrados.
- [x] Las rondas suizas se limitan a 1..n-1 y advierten si quedan pocas para definir campeón.
- [x] Los errores bloqueantes impiden guardar el formato.
- [x] Cada parámetro visible incluye una descripción en español rioplatense.

## Cómo verificarlo

1. Ejecutá `npm start`.
2. Abrí el panel y elegí **Formato**.
3. Elegí un formato y cambiá sus parámetros.
4. Verificá que los totales de partidos, partidos por equipo y duración cambien en vivo.
5. Probá 11 equipos en 3 grupos y luego 2 grupos para ver 4-4-3 y 6-5.
6. Probá 0 clasificados o más clasificados que el grupo más chico; el botón Guardar debe quedar bloqueado.
7. Probá el suizo con pocas rondas y confirmá que aparece la advertencia.
8. Guardá una configuración válida y verificá que persista al volver a abrir la pantalla.

## Tests

Se agregaron casos de validación y recálculo en `src/domain/format-options.spec.ts`, incluyendo:

- reparto 11 equipos en 3 grupos (4-4-3) y alternativa 6-5;
- menos de 2 equipos;
- más grupos que la mitad de los equipos;
- cero clasificados;
- clasificados mayores que el grupo más chico;
- rango de rondas suizas y advertencia por pocas rondas;
- byes en llave no potencia de 2;
- recálculo de totales después de cambiar parámetros.

## Validación completa

```text
npm run lint
All files pass linting.

npm test
Test Files 17 passed (17)
Tests 92 passed (92)

npm run build
Application bundle generation complete.
```

El build mantiene los warnings conocidos de tamaño del bundle y CommonJS de PapaParse.

## Decisiones y pendientes

- Las reglas viven en funciones puras de `domain/`; la edición solo cambia estado Angular hasta que se presiona Guardar.
- Los byes se describen por posición de siembra porque todavía no existen equipos sorteados en esta pantalla.
