# HU-12 sorteo de jugadores sueltos en equipos

## Implementado

- Sorteo determinista de jugadores sueltos con `Rng` inyectado.
- Creación de equipos nuevos o completado de equipos existentes seleccionados.
- Respeto de los mínimos y máximos de plantel.
- Aviso del máximo posible cuando no alcanza la cantidad de jugadores.
- Balance opcional por categoría y género, desactivado por defecto.
- Vista previa con acciones para repetir, confirmar o cancelar.
- Equipos nuevos con colores por defecto y nombres `Equipo 1..n` o `M16 A..C`.
- Persistencia atómica de equipos, asignaciones y `Draw` de tipo `TEAMS`.
- Función deshabilitada cuando el torneo está en curso.
- Límites mínimo y máximo configurables desde la pestaña de equipos; un máximo vacío significa
  que no hay límite superior.

## Tests

- Reparto parejo de 14 jugadores en dos equipos.
- Balance por categoría y género en rondas.
- Máximo posible cuando no alcanza la cantidad solicitada.
- Completado de un equipo existente.
- Suite completa: 54 tests aprobados.

## Verificación manual

1. Abrir `/#/panel/equipos` con jugadores sueltos.
2. Elegir la cantidad de equipos nuevos y, opcionalmente, equipos existentes a completar.
3. Activar «Balancear por categoría y género» si corresponde.
4. Presionar «Sortear» y revisar la vista previa.
5. Repetir el sorteo y confirmar que cambia la distribución.
6. Confirmar el sorteo y verificar que se crean los equipos y se asignan los jugadores.
7. Revisar que los equipos ya armados no seleccionados no cambien.
8. Con el torneo en curso, confirmar que la función aparece deshabilitada.
