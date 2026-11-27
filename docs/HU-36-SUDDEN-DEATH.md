# HU-36: Empate en eliminacion y muerte súbita

## Implementado

- [x] Los partidos eliminatorios empatados no se pueden finalizar sin elegir un ganador.
- [x] La carga de detalle y el marcador directo admiten muerte súbita.
- [x] Se persisten los puntos regulares empatados, `winnerTeamId` y `definition = SUDDEN_DEATH`.
- [x] La mesa de control ofrece dos botones con los equipos resueltos.
- [x] El resultado en fixture muestra el marcador empatado y el equipo definido por muerte súbita.
- [x] Un marcador posterior no empatado vuelve a `REGULAR` y limpia el ganador guardado.
- [x] Los goles registrados siguen dependiendo solo de tries y conversiones; la muerte súbita no crea eventos.

## Criterios cubiertos

- Eliminación, copa, llaves y final bloquean empates sin definición.
- El resultado conserva el marcador de tiempo regular empatado.
- `WINNER_OF` y `LOSER_OF` ya resuelven el ganador persistido.
- La edición a un marcador no empatado limpia los campos de muerte súbita.
- El ganador de muerte súbita no suma como evento ni afecta goleadores.

## Cómo verificar

1. Ejecutá `npm start`.
2. Abrí `/#/panel`, cargá un torneo con formato de eliminación y poné un partido en juego.
3. Cargá un empate con detalle o directo.
4. Verificá que el botón normal desaparece y aparecen las opciones para dar el triunfo a cada equipo.
5. Elegí un equipo, confirmá y revisá el resultado en Fixture.

## Validación

- `npm run lint`: aprobado.
- `npm test`: 31 archivos, 226 pruebas aprobadas.
- `npm run build`: aprobado con las advertencias existentes de presupuesto y módulo CommonJS.

## Decisiones y pendientes

- Se reutilizó el campo existente `winnerTeamId` y no se creó ningún evento para la definición.
- La UI del proyector todavía depende del spike general de HU-42; el aviso se muestra en resultados de fixture y se debe verificar en la integración posterior del proyector.
