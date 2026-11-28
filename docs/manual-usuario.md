# Manual de usuario de fast-seven

Guía para preparar, operar y cerrar un torneo de rugby seven con fast-seven. La aplicación está pensada para una sola persona organizadora, un torneo activo y una cancha.

## Índice

1. [Antes de empezar](#1-antes-de-empezar)
2. [Crear o retomar un torneo](#2-crear-o-retomar-un-torneo)
3. [Preparar jugadores y equipos](#3-preparar-jugadores-y-equipos)
4. [Importar jugadores desde una planilla](#4-importar-jugadores-desde-una-planilla)
5. [Configurar las reglas](#5-configurar-las-reglas)
6. [Elegir el formato y generar el fixture](#6-elegir-el-formato-y-generar-el-fixture)
7. [Dirigir los partidos](#7-dirigir-los-partidos)
8. [Usar la pantalla del proyector](#8-usar-la-pantalla-del-proyector)
9. [Guardar, respaldar y recuperar el torneo](#9-guardar-respaldar-y-recuperar-el-torneo)
10. [Reiniciar o empezar otro torneo](#10-reiniciar-o-empezar-otro-torneo)
11. [Problemas frecuentes](#11-problemas-frecuentes)

## 1. Antes de empezar

Abrí la URL publicada de fast-seven. Si estás ejecutando el proyecto en tu computadora, iniciá el servidor con `npm start` y abrí `http://localhost:4200/#/`.

### Dónde se guardan los datos

Los jugadores, equipos, reglas, fixture y resultados se guardan en el almacenamiento del navegador de esta computadora. No hace falta crear una cuenta, pero los datos tampoco se sincronizan automáticamente con otra computadora.

Los cambios se guardan en el navegador mientras trabajás. **Guardar torneo** descarga una copia externa que tenés que conservar vos.

Para cuidar el torneo:

- Abrí la aplicación con conexión a internet la primera vez y esperá a que indique que está lista para usarse sin conexión.
- No uses una ventana privada ni borres los datos del sitio mientras haya un torneo que quieras conservar.
- Guardá periódicamente el **archivo del torneo** fuera del navegador. Las copias automáticas locales ayudan a recuperar cambios, pero no reemplazan ese archivo.
- Para continuar en otra computadora, descargá el archivo del torneo y cargalo allí.

### El panel y el proyector

- **Panel en vivo:** es la pantalla de operación. Desde ahí se controlan partidos y se modifican los datos.
- **Proyector:** es una pantalla pública de solo lectura que se abre en otra ventana y recibe las actualizaciones del panel.
- Solo debe haber un panel escribiendo a la vez. Si abrís otro panel, puede quedar en solo lectura. El proyector sí puede estar abierto al mismo tiempo.

## 2. Crear o retomar un torneo

1. Abrí fast-seven. Si todavía no hay un torneo en este navegador, vas a ver la pantalla de bienvenida.
2. Escribí el nombre del torneo y elegí **Crear torneo**.
3. La aplicación abre el **Panel en vivo**. Si ya existía un torneo, fast-seven lo retoma en la última pantalla usada.
4. En la barra superior podés **Guardar torneo** a un archivo o **Cargar torneo desde archivo**.

El torneo nuevo empieza con reglas iniciales (entre ellas, puntos 3-2-1 y valores predeterminados de plantel y horario). Revisalas en **Reglas** antes de empezar. Podés volver al panel desde el menú lateral.

## 3. Preparar jugadores y equipos

### Cargar jugadores manualmente

1. Entrá en **Jugadores** y elegí **Agregar jugador**.
2. Completá nombre, apellido, categoría y género.
3. Elegí **Guardar jugador**. Si todavía no está asignado a un equipo, aparecerá como **Suelto**.
4. Usá la búsqueda y los filtros de equipo, categoría y género para encontrar registros. **Editar** permite corregirlos y **Borrar** solicita confirmación.

Si aparece una coincidencia por nombre, apellido y categoría, revisá el aviso:

- **Es la misma persona** actualiza el registro existente.
- **Son personas distintas** permite agregar una aclaración para distinguir a los homónimos.

Al borrar un jugador que figura como autor de eventos, esos eventos quedan sin autor; el marcador del partido no cambia.

### Crear y organizar equipos

1. Entrá en **Equipos** y elegí **Agregar equipo**.
2. Indicá nombre, colores primario y secundario y, si corresponde, capitán. El capitán se elige entre los jugadores ya asignados a ese equipo.
3. Marcá **Cabeza de serie** si ese equipo debe recibir el tratamiento de siembra previsto por el formato.
4. Guardá el equipo. Si los colores son demasiado parecidos, revisalos antes de confirmar.

En **Asignación de jugadores**:

1. Seleccioná el equipo.
2. Marcá los jugadores sueltos que quieras asignar y elegí **Asignar al equipo**.
3. Para devolver jugadores, marcá los asignados y elegí **Devolver a sueltos**.

La pantalla informa si el plantel está por debajo del mínimo, por encima del máximo o tiene categorías o géneros mezclados. Estos avisos ayudan a revisar la inscripción; no siempre impiden continuar.

También podés completar equipos existentes automáticamente:

1. En **Sortear jugadores sueltos**, marcá los equipos que querés completar.
2. Opcionalmente, activá **Balancear por categoría y género**.
3. Elegí **Sortear** y revisá la vista previa.
4. Si querés otra distribución, elegí **Repetir sorteo**. Para aplicarla, elegí **Confirmar sorteo**; para descartarla, **Cancelar**.

Este sorteo distribuye jugadores sueltos entre los equipos existentes seleccionados; no crea equipos nuevos. Una vez iniciado el torneo, el sorteo queda deshabilitado.

Durante un torneo en curso podés **Retirar equipo** o **Reincorporar equipo**. Leé con cuidado la confirmación: retirar un equipo puede convertir partidos pendientes contra equipos activos en W.O.; primero hay que resolver cualquier partido que ese equipo tenga en juego.

## 4. Importar jugadores desde una planilla

La importación admite archivos CSV, XLSX y XLS. No importa jugadores ni equipos hasta que confirmes el último paso. Si agregás una categoría desconocida durante la revisión, esa categoría se incorpora al catálogo del torneo.

1. Desde **Jugadores**, elegí **Importar planilla**, o entrá en **Importar jugadores** desde el menú. También podés descargar la plantilla de ejemplo.
2. Arrastrá el archivo al área indicada o elegí **Elegir archivo**.
3. En archivos CSV, revisá codificación y separador. Si es un Excel con varias hojas, elegí la hoja correcta. Revisá la vista previa y elegí **Continuar al mapeo**.
4. En **Columnas**, asociá las columnas del archivo con nombre (o nombre completo), apellido, categoría, género y equipo. El equipo es opcional; lo que no tenga equipo quedará suelto. Si usás nombre completo, indicá si viene como «Apellido, Nombre» o «Nombre + resto como apellido».
5. Elegí **Confirmar mapeo**. En **Revisión de importación** podés filtrar por estado, corregir celdas, agregar una categoría desconocida y descartar filas. Los errores deben corregirse o descartarse antes de avanzar.
6. Revisá los duplicados. Podés indicar que dos filas son personas distintas; los duplicados existentes se resuelven en el paso de confirmación.
7. En **Confirmación**, elegí si los equipos entrantes se unifican con equipos existentes o se crean cuando esté permitido. Para cada duplicado, podés omitirlo, actualizar su equipo o marcarlo como persona distinta.
8. Elegí **Importar** y revisá el resumen de jugadores creados u omitidos, equipos creados y equipos por debajo del mínimo.

La importación revisa y normaliza categorías, género y nombres de equipo; aun así, verificá el resumen antes de seguir. Si el torneo ya está en curso, no se crean equipos nuevos: resolvé los equipos entrantes con los existentes o dejá jugadores sin equipo.

## 5. Configurar las reglas

Entrá en **Reglas** antes de generar el fixture. Al terminar, elegí **Guardar reglas**.

Podés configurar:

- Nombre y fecha del torneo.
- Puntos de tabla: preset **3-2-1**, **4-2-0 con bonus** o **Personalizado**. En personalizado, ajustá puntos por victoria, empate, derrota y derrota por W.O., además de los bonus.
- Orden de desempates. Elegí un criterio y usá **Subir** o **Bajar** para ordenarlo. El sorteo siempre queda último; Buchholz aparece cuando el formato es suizo.
- Marcador de W.O. para el ganador y el perdedor.
- Tratamiento del bye: si otorga puntos de victoria y si suma el marcador de W.O.
- Mínimo y máximo de jugadores por equipo. Dejá el máximo vacío si no querés fijarlo.
- Hora de inicio, duración del partido y descanso entre partidos. Se usan para calcular horarios tentativos.

La victoria con menos puntos que el empate genera un aviso, pero no bloquea el guardado. Si cambiás reglas con el torneo en curso, las posiciones se recalculan; revisá los resultados derivados antes de continuar.

## 6. Elegir el formato y generar el fixture

### Elegir el formato

1. Entrá en **Formato**.
2. Revisá la cantidad de equipos, duración y descanso. La cantidad se puede cambiar para comparar escenarios; el fixture real depende de los equipos activos.
3. Compará hasta tres formatos marcando sus casillas. Cada tarjeta indica partidos, mínimo y máximo de partidos por equipo, duración estimada, parámetros y advertencias.
4. Elegí **Elegir formato** en la opción que prefieras.
5. Ajustá los parámetros que aparezcan: vueltas, grupos, clasificados, tercer puesto, rondas suizas o final con reinicio, según corresponda.
6. Si usás grupos, podés elegir **Sortear grupos**, revisar la distribución, intercambiar equipos entre grupos y **Confirmar grupos**.
7. Elegí **Guardar formato**.

Formatos disponibles: todos contra todos, grupos más eliminación directa, grupos más copas, eliminación directa simple, grupos más cruces de posiciones, suizo y doble eliminación. Las opciones no compatibles con la cantidad de equipos aparecen deshabilitadas con el motivo.

Guardar el formato **no genera** los partidos.

### Generar y revisar el fixture

1. Entrá en **Fixture y resultados**.
2. Confirmá que haya al menos dos equipos activos y que el formato esté guardado.
3. Elegí **Generar fixture** y revisá el resumen: cantidad de partidos, mínimo por equipo, duración estimada, descansos cortos y avisos.
4. Revisá partidos, rondas, grupos y cruces. En partidos pendientes podés usar **Subir** o **Bajar** para modificar el orden; **Restablecer orden sugerido** recupera el orden propuesto.

Regenerar reemplaza el fixture y los sorteos asociados, pero conserva jugadores y equipos; requiere confirmación. Una vez iniciado el torneo, primero hay que reiniciarlo para cambiar o regenerar el fixture.

En formato suizo, cada ronda siguiente se prepara cuando se completaron todos los partidos de la ronda anterior. Elegí **Preparar emparejamientos**, revisá la vista previa y aprobá la ronda. Si no hay una combinación sin rivales repetidos, la aplicación explica la alternativa y pide confirmación.

## 7. Dirigir los partidos

### Iniciar el torneo y poner un partido en juego

1. Volvé al **Panel en vivo** y elegí **Iniciar torneo**.
2. Confirmá que querés comenzar. Desde ese momento quedan bloqueados cambios estructurales como cambiar el formato, regenerar el fixture o agregar y borrar equipos.
3. En **Próximo partido**, revisá los equipos y la hora tentativa. Elegí **Poner en juego**.

El panel permite un solo partido en juego a la vez. Los partidos posteriores aparecen en **Siguientes partidos**.

### Cargar el resultado con tries y conversiones

Esta modalidad es la recomendada cuando querés llevar goleadores:

1. En **Partido en juego**, elegí el jugador que anota en la lista de su equipo, o **Sin autor**.
2. Elegí **Try** o **Conversión**. El marcador se actualiza automáticamente: 5 puntos por try y 2 por conversión.
3. Revisá la lista de **Eventos**. Si cargaste uno por error, elegí **Deshacer** junto a ese evento.
4. Al terminar, elegí **Finalizar** y confirmá el resultado.

Una conversión solo se puede cargar si ese equipo tiene un try disponible para convertir. Para un partido eliminatorio empatado, elegí cuál equipo gana por muerte súbita antes de finalizar.

### Cargar un marcador directo

1. En el partido en juego, elegí **Cargar marcador sin detalle**.
2. Completá los puntos de local y visitante.
3. Elegí **Finalizar** y confirmá. Si ya habías cargado eventos, la aplicación avisa que se van a descartar al pasar a marcador directo.

Esta modalidad guarda el resultado, pero no el detalle de tries, conversiones ni goleadores del partido.

### Registrar un W.O. o deshacer un inicio

- Elegí **W.O.**, indicá qué equipo no se presentó y confirmá el marcador propuesto según las reglas. Los partidos pendientes de un equipo retirado pueden pasar a W.O. automáticamente cuando su rival sigue activo.
- Si pusiste un partido en juego por error, elegí **Volver a pendiente**. La aplicación confirma la acción y pregunta si querés conservar los eventos cargados.

### Editar un resultado ya finalizado

Desde **Fixture y resultados**, elegí **Editar resultado** en el partido. Podés cambiar modalidad, marcador, definición y eventos. Elegí **Revisar y guardar** para ver el impacto antes de confirmar.

Si cambiar ese resultado afecta cruces posteriores, se abre una revisión de cascada: muestra qué partidos cambiarían y qué resultados o eventos se perderían. Confirmar reinicia esos partidos afectados; cancelar conserva todo. Después de una edición con cascada está disponible **Deshacer última edición con cascada**, que restaura la copia anterior y puede descartar cambios posteriores: revisá la confirmación antes de usarlo.

### Cerrar el torneo

Cuando todos los partidos estén resueltos, el panel habilita **Cerrar torneo**. Confirmá para mostrar el resultado final: campeón, subcampeón, posiciones y mejores goleadores. Después del cierre todavía podés editar resultados desde el fixture.

## 8. Usar la pantalla del proyector

1. Desde el Panel en vivo, elegí **Abrir proyector**. Si el navegador bloquea la ventana, permití ventanas emergentes para el sitio y volvé a intentarlo.
2. Arrastrá la nueva ventana al monitor externo y elegí **Pantalla completa** dentro de esa ventana.
3. Revisá en el panel el indicador **Proyector conectado**. El proyector muestra los datos del torneo, pero no permite modificarlos.

En el panel, desplegá **Control del proyector** para:

- Dejar la vista en **Automática** o fijar una vista. Según los datos disponibles, se pueden mostrar equipos y fixture, partido en juego, próximo partido, partidos recientes y próximos, tabla, cuadro de eliminación, goleadores, resultados o posiciones finales.
- Elegir una copa o etapa cuando fijás un cuadro.
- Configurar un temporizador con nombre y duración, iniciarlo, sumarle o restarle un minuto y cerrarlo. Podés activar el sonido al finalizar.
- Escribir un mensaje de hasta 140 caracteres y mostrarlo como banda inferior o a pantalla completa. Podés actualizarlo o borrarlo.

El temporizador y el mensaje son controles del proyector; no reemplazan el registro del marcador ni los horarios del fixture.

## 9. Guardar, respaldar y recuperar el torneo

### Archivo del torneo

- Elegí **Guardar torneo** en la barra superior para descargar un archivo JSON. Guardalo en una ubicación que puedas encontrar y, si hace falta, copiálo a otro dispositivo.
- Si aparece un aviso de cambios sin guardar, descargá el archivo antes de cerrar o cambiar de computadora.
- Para restaurar o transferir un torneo, elegí **Cargar torneo desde archivo**, seleccioná el JSON y revisá la confirmación. Cargarlo reemplaza el torneo actual; se crea una copia local antes de la operación.
- En Chrome o Edge, podés elegir una carpeta para copias automáticas. Concedé permiso cuando el navegador lo pida. Si no aparece esa opción, seguí usando **Guardar torneo**.

### Copias automáticas del navegador

fast-seven conserva copias locales rotativas. El intervalo inicial es de 5 minutos cuando hubo cambios; podés modificarlo entre 1 y 60 minutos en **Ajustes**. Estas copias no son un archivo externo y no sirven por sí solas para trasladar el torneo a otra computadora.

En **Respaldos**, revisá fecha, motivo y cantidad de partidos finalizados. **Restaurar** solicita confirmación y guarda una copia del estado actual antes de recuperar la seleccionada.

## 10. Reiniciar o empezar otro torneo

Estas acciones borran o reemplazan datos; guardá un archivo JSON antes de usarlas.

- **Reiniciar fixture** está disponible durante un torneo en curso y pide dos confirmaciones. Borra etapas, grupos, partidos, eventos y sorteos del fixture; conserva jugadores y equipos y vuelve a configuración. Después hay que elegir el formato y generar un fixture nuevo.
- **Nuevo torneo** elimina el torneo y sus datos de trabajo, pero conserva las copias automáticas locales. Para continuar, escribí exactamente **BORRAR** en la confirmación y creá el nuevo torneo desde la bienvenida.

## 11. Problemas frecuentes

| Situación                                     | Qué hacer                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| El panel queda en solo lectura                | Cerrá la otra ventana del panel. Si corresponde, usá **Tomar control**. El proyector no cuenta como otro panel escritor.                    |
| No se abre el proyector                       | Permití ventanas emergentes para fast-seven y elegí **Abrir proyector** otra vez.                                                           |
| No podés generar el fixture                   | Revisá que haya al menos dos equipos activos y que el formato esté guardado.                                                                |
| Una importación no avanza                     | Filtrá las filas con error, corregí los datos o descartá las filas que no correspondan; después revisá duplicados y equipos.                |
| No aparece una conversión                     | Primero tiene que haber un try de ese equipo en el partido.                                                                                 |
| El torneo no se puede guardar en el navegador | Salí del modo privado, habilitá el almacenamiento del sitio y recargá. Si el torneo sigue accesible, descargá un archivo JSON cuanto antes. |
| Aparece un error en un modal                  | Leé el mensaje y la acción propuesta. Cerralo con **Entendido** o usá la acción disponible, como guardar el torneo o revisar copias.        |

### Navegación directa

Si necesitás volver a una pantalla, agregá el fragmento indicado a la URL base de la aplicación (por ejemplo, `https://tu-sitio/fast-seven/#/panel` en GitHub Pages):

| Pantalla             | Fragmento                    |
| -------------------- | ---------------------------- |
| Panel en vivo        | `#/panel`                    |
| Fixture y resultados | `#/panel/fixture`            |
| Jugadores            | `#/jugadores`                |
| Importar jugadores   | `#/panel/jugadores/importar` |
| Equipos              | `#/equipos`                  |
| Reglas               | `#/panel/reglas`             |
| Formato              | `#/panel/formato`            |
| Respaldos            | `#/panel/respaldo`           |
| Ajustes              | `#/panel/ajustes`            |
| Proyector            | `#/proyector`                |

En la pantalla del panel también existe **Guardar prueba**. Es una herramienta técnica para probar la escritura de datos, no registra resultados ni forma parte del flujo normal del torneo. Para conservar una copia portable, usá **Guardar torneo**.
