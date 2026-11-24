# HU-22 - Cabezas de serie y sorteo de grupos

## Implementado

- [x] Los equipos se pueden marcar como cabezas de serie desde la lista de equipos.
- [x] El sorteo reparte cabezas por tandas, una por grupo antes de repetir grupo, y completa
      los lugares restantes con los demás equipos.
- [x] Cada sorteo guarda su semilla y el resultado `GROUPS`, por lo que puede reproducirse.
- [x] La vista previa muestra los equipos por grupo y explica las cabezas y los grupos desparejos.
- [x] Se puede repetir, ajustar manualmente intercambiando equipos entre grupos y confirmar el
      sorteo sin alterar los tamaños configurados.
- [x] El sorteo solo se habilita en `SETUP` o `FIXTURE_GENERATED`.

## Cómo verificarlo

1. Ejecutá `npm start` y abrí **Panel → Equipos**.
2. Editá algunos equipos y marcá **Cabeza de serie**.
3. Abrí **Panel → Formato**, elegí un formato con grupos y guardalo.
4. En **Sorteo de grupos**, elegí **Sortear grupos** y comprobá la explicación y el reparto.
5. Elegí el equipo de origen, el grupo destino y el equipo que intercambia lugar; confirmá que se
   actualicen ambos grupos y se mantenga su cantidad de equipos.
6. Elegí **Repetir sorteo** para comprobar que se genera y guarda una nueva semilla.

## Tests

- `src/domain/group-draw.spec.ts`: reparto por tandas, reproducibilidad, validación de movimientos
  y creación de grupos persistibles.

## Decisiones y pendientes

- El ajuste manual intercambia equipos entre dos grupos, conservando el tamaño de ambos incluso
  cuando el reparto general es desparejo.
- La siembra específica de llaves de eliminación y de la primera ronda suiza queda para HU-24
  y HU-53, respectivamente.
