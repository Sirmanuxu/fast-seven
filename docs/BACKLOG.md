# Gestor de Torneo de Rugby Seven: Arquitectura, Modelo de Datos y Backlog

Documento de relevamiento · Versión 1.1 · 18 de noviembre de 2026 · Listo para codificar

## 1. Resumen de arquitectura, stack y despliegue

### 1.1 Qué es

Aplicación web de uso local para gestionar un torneo de rugby seven de punta a punta: inscripción de jugadores, equipos, elección de formato, fixture, resultados, tablas, pantalla de proyector y cierre. Un torneo a la vez, una sola cancha, sin usuarios ni seguridad. Prioridades: que funcione plug and play y que la lógica de dominio sea correcta.

### 1.2 Decisiones cerradas

| Tema | Decisión |
| --- | --- |
| Tipo de app | SPA 100% en el navegador, sin backend. PWA con funcionamiento offline. |
| Lenguaje y framework | TypeScript + Angular (standalone components, signals). |
| Dominio | Carpeta `domain/` de TypeScript puro, sin imports de Angular ni del navegador. Tests unitarios con Vitest. |
| Persistencia | IndexedDB con Dexie. `navigator.storage.persist()` para evitar borrado. 10 copias rotativas internas. Archivo de respaldo versionado. Guardado automático a carpeta con File System Access API (solo Chrome/Edge, opcional). |
| Importación | PapaParse (CSV) y SheetJS (Excel). |
| Dos pantallas | Rutas `/panel` y `/proyector` con hash routing. Sincronización con `BroadcastChannel`. El proyector es una ventana que se arrastra al segundo monitor. |
| Despliegue | GitHub Pages + service worker (`@angular/service-worker`). Primera visita con internet, después funciona sin conexión. |
| Navegadores | Objetivo: Chrome y Edge (Windows y Ubuntu). Firefox y Safari en modo best effort (sin guardado automático a carpeta). |
| Plan B de despliegue | `.zip` portable con lanzador mínimo o build en un solo HTML. Se decide en el spike HU-01. |

### 1.3 Capas

- `domain/`: reglas puras. Funciones que reciben estado y devuelven estado nuevo: generadores de fixture, motor de posiciones y desempates, resolución de cruces, recálculo en cascada, cronograma, normalización de jugadores, validaciones. La aleatoriedad (sorteos) y el reloj se inyectan, así los tests son deterministas.
- `data/`: repositorio sobre Dexie, respaldos, exportar e importar archivo del torneo, migraciones de esquema.
- `import/`: lectura de CSV y Excel, detección de codificación y delimitador, mapeo, normalización.
- `sync/`: canal entre panel y proyector, bloqueo de panel único.
- `app/`: componentes Angular (panel y proyector). Sin reglas de negocio.

### 1.4 Principios de diseño

1. **Fuente de verdad mínima.** Se guardan jugadores, equipos, partidos, eventos y sorteos. Todo lo demás se deriva y se recalcula: tablas, goleadores, clasificados, resolución de cruces y horarios tentativos.
2. **Lo aleatorio se persiste.** Un sorteo (de grupos, de equipos o de desempate) se guarda y no cambia al refrescar ni al recalcular.
3. **Recalcular, no parchear.** Al editar un resultado se recalcula todo el estado derivado y se compara contra el anterior para detectar cruces afectados.
4. **Los cruces son referencias.** Un partido de eliminación se define como «1° del Grupo A» o «Ganador del partido 14», nunca con un equipo fijo. Así la edición y el reseteo son triviales.
5. **El árbitro manda.** El sistema avisa, no bloquea (salvo integridad de datos).
6. **Explicar lo raro.** Toda decisión no obvia (desempate, grupo desparejo, bye, sorteo, muerte súbita) muestra su explicación en la UI.
7. **Un solo escritor.** Solo el panel escribe. El proyector solo lee. Si se abre un segundo panel, se avisa y queda en solo lectura (Web Locks API).
8. **IDs UUID** en todas las entidades, para facilitar una migración futura a Postgres.

### 1.5 Despliegue y operación

- Build con `--base-href` del repositorio y hash routing (GitHub Pages no resuelve rutas de SPA).
- Checklist previo al torneo: abrir la URL con internet, esperar el indicador «Listo para usar sin conexión» y probar guardar y cargar un torneo de prueba.
- El service worker avisa «hay una versión nueva», pero **nunca recarga solo con un torneo en curso**. Se actualiza cuando el usuario lo decide.
- Los datos viven en el navegador de esa computadora. Para pasar el torneo a otra máquina se usa el archivo de guardado (flujo visible en la UI).
- Camino de escalado: SPA como cliente de un backend Spring Boot + Postgres. Las reglas de `domain/` se reutilizan en el cliente o se portan a Java.

## 2. Catálogo de formatos

El asistente de formato recibe la cantidad de equipos y muestra una tarjeta por formato viable, con su descripción, parámetros, total de partidos, mínimo de partidos por equipo, duración estimada y advertencias. Notación: n = equipos, k = equipos de un grupo, g = grupos, Q = clasificados a eliminación, r = rondas, v = vueltas.

| # | Formato | Total de partidos | Mínimo por equipo |
| --- | --- | --- | --- |
| 1 | Todos contra todos | v · n(n−1)/2 | v · (n−1) |
| 2 | Grupos + eliminación directa | Σ k(k−1)/2 por grupo + (Q−1), +1 si hay 3er puesto | (k mínimo − 1) |
| 3 | Grupos + copas | Σ k(k−1)/2 por grupo + partidos de cada copa | (k mínimo − 1) + al menos 1 en su copa (salvo bye) |
| 4 | Eliminación directa simple | n−1, +1 si hay 3er puesto | 1 |
| 5 | Grupos + cruces de posiciones | Σ k(k−1)/2 por grupo + partidos de cruces | (k mínimo − 1) + 1 |
| 6 | Suizo | r · ⌊n/2⌋ | r (r−1 si recibe bye) |
| 7 | Doble eliminación | 2n−2 (2n−1 si la final tiene reinicio) | 2 (el asistente calcula el real con byes) |

### 2.1 Todos contra todos

**Descripción para la UI:** todos juegan contra todos. Gana quien más puntos de tabla suma. Es el formato más justo y el que más partidos garantiza, pero crece rápido: con 8 equipos son 28 partidos, con 12 son 66.

- Parámetro: vueltas (1 o 2).
- Con n impar, en cada fecha un equipo descansa (se usa el método del círculo). El descanso se muestra como «Libre», no es un partido.
- Si hay 2 vueltas, la segunda invierte local y visitante.

### 2.2 Grupos + eliminación directa

**Descripción para la UI:** los equipos se reparten en grupos y juegan todos contra todos dentro del grupo. Los mejores de cada grupo pasan a una llave de eliminación donde el que pierde queda afuera.

- Parámetros: cantidad de grupos, equipos por grupo, clasificados por grupo, partido por el 3er puesto.
- Si el total de clasificados no es potencia de 2, la llave se completa con byes y los reciben los mejores sembrados.
- Siembra de la llave: primero todos los primeros de grupo, luego los segundos, etc. Dentro de cada nivel se ordenan por puntos de tabla, diferencia de puntos y puntos a favor (con la regla de grupos desparejos, ver 2.8). Se evita en lo posible que dos equipos del mismo grupo se crucen en la primera ronda.

### 2.3 Grupos + copas

**Descripción para la UI:** después de la fase de grupos, cada equipo juega una copa según su posición: los primeros van a la Copa de Oro, los segundos a la de Plata, los terceros a la de Bronce, y así. Todos juegan algo importante hasta el final.

- Parámetros: cantidad de grupos, equipos por grupo, partido por el 3er puesto de cada copa.
- Cada copa es una eliminación directa con los equipos de esa posición. Si no es potencia de 2, byes por sembrado.
- Grupos desparejos: los grupos con un equipo menos aportan menos equipos a la última copa. El sistema lo explica y arma esa copa con los que haya.
- Nombres de copas: Oro, Plata, Bronce, Cobre y luego numeradas (Copa 5, Copa 6).

### 2.4 Eliminación directa simple

**Descripción para la UI:** llave de eliminación desde el primer partido. Es el formato más corto, pero la mitad de los equipos juega un solo partido. El asistente lo avisa.

- Parámetro: partido por el 3er puesto.
- Tamaño de llave = potencia de 2 ≥ n. Byes = tamaño − n, asignados a los mejores sembrados.
- Sin cabezas de serie, el orden de la llave sale de un sorteo guardado. Con cabezas de serie, se ubican en los extremos de la llave.

### 2.5 Grupos + cruces de posiciones

**Descripción para la UI:** todos los equipos terminan con una posición final exacta (1° al último). Después de los grupos, los equipos que quedaron en la misma posición de cada grupo se cruzan entre sí para definir puestos.

- Con 2 grupos: 1°A vs 1°B define 1° y 2°. 2°A vs 2°B define 3° y 4°, y así sucesivamente.
- Con 3 o más grupos: los equipos de la misma posición forman un nivel. Si el nivel tiene hasta 4 equipos juega todos contra todos, si tiene más juega eliminación directa. **Decisión de diseño a validar al implementar.**
- Grupos desparejos: el último nivel tiene menos equipos. El sistema lo explica.

### 2.6 Suizo

**Descripción para la UI:** cantidad fija de rondas sin eliminar a nadie. En cada ronda juegan entre sí equipos con puntaje parecido, sin repetir rival. Ideal con muchos equipos y poco tiempo.

- Parámetro: rondas (default ⌈log₂ n⌉, mínimo 1, máximo n−1 para no repetir rivales).
- **Ronda 1:** por sorteo guardado o, si hay cabezas de serie, mitad superior contra mitad inferior.
- **Rondas siguientes:** se generan al cerrar todos los partidos de la ronda anterior. El fixture no se conoce completo por adelantado. El cronograma muestra las rondas futuras como estimadas.
- **Emparejamiento:** se agrupa por puntos de tabla y se busca el emparejamiento más parejo sin repetir rivales (backtracking, alcanza con pocos equipos). Si no hay emparejamiento sin repetición, se avisa y se permite elegir la opción menos mala.
- **Bye (n impar):** lo recibe un equipo por ronda, nunca el mismo dos veces, preferentemente el de menor puntaje. Cuenta como victoria en puntos de tabla y no suma puntos a favor ni en contra (configurable).
- Desempate extra disponible: Buchholz (suma de puntos de tabla de los rivales enfrentados).
- Posiciones finales: tabla única por puntos de tabla y desempates.

### 2.7 Doble eliminación

**Descripción para la UI:** cada equipo queda eliminado recién cuando pierde dos veces. Hay una llave de ganadores y otra de perdedores. El campeón de cada llave se enfrenta en la final.

- Parámetros: **final con reinicio** (sí/no).
- Final: campeón de ganadores vs campeón de perdedores. Si gana el de ganadores, termina. Si gana el de perdedores y hay reinicio, se juega un segundo partido.
- Con n que no es potencia de 2, la llave se arma para el tamaño siguiente y los partidos con bye se resuelven solos («fantasmas»). Esos partidos no cuentan ni se muestran.
- Posiciones finales: 1° y 2° por la final, 3° el perdedor de la final de perdedores, 4° el perdedor de la penúltima ronda de perdedores, y así por ronda de eliminación. Los eliminados en la misma ronda comparten puesto y se desempatan con la tabla general acumulada.
- En doble eliminación no se usa partido por el 3er puesto.

### 2.8 Reglas transversales

**Grupos desparejos** (ej. 11 equipos en 3 grupos: 4-4-3):

- Dentro del grupo la tabla es normal.
- Al comparar equipos de **grupos distintos** (siembra, mejor segundo, niveles de copa), se descartan los partidos contra el último de cada grupo de más equipos, para que todos tengan la misma cantidad de partidos comparables.
- La UI muestra un aviso con la regla y, al ver la tabla comparativa, indica qué partidos se descartaron.
- Si el último de un grupo de más equipos está empatado con otros en esa posición, se descarta el resultado de la tabla del grupo contra el equipo que quedó último después de aplicar los desempates.

**Cabezas de serie:**

- Cada equipo tiene una marca de cabeza de serie.
- Sorteo de grupos: las cabezas de serie se reparten una por grupo. Si hay más cabezas que grupos, se reparten por tandas (las primeras g, luego las siguientes g, etc.). Los demás equipos se sortean libremente respetando el tamaño de cada grupo.
- Si hay menos cabezas que grupos, algunos grupos quedan sin cabeza. El sistema lo informa.
- El sorteo se puede repetir mientras no se haya iniciado el torneo. Cada resultado se guarda.

**Parámetros por formato:**

| Parámetro | Formatos |
| --- | --- |
| Vueltas | Todos contra todos |
| Cantidad de grupos / equipos por grupo | 2, 3, 5 |
| Clasificados por grupo | 2 |
| Partido por el 3er puesto | 2, 3, 4 |
| Rondas | Suizo |
| Final con reinicio | Doble eliminación |
| Cabezas de serie | 2, 3, 4, 5, 6 (primera ronda) |

## 3. Modelo de datos

Todas las entidades usan `id` UUID (string). Los campos marcados con (derivado) no se guardan.

### 3.1 Torneo (registro único)

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | string | UUID |
| nombre | string |  |
| fecha | date |  |
| estado | enum | CONFIGURACION, FIXTURE\_GENERADO, EN\_CURSO, FINALIZADO |
| formato | enum | TODOS\_CONTRA\_TODOS, GRUPOS\_ELIMINACION, GRUPOS\_COPAS, ELIMINACION\_DIRECTA, GRUPOS\_CRUCES, SUIZO, DOBLE\_ELIMINACION |
| parametrosFormato | objeto | vueltas, grupos, equiposPorGrupo, clasificadosPorGrupo, terceroPuesto, rondas, finalConReinicio |
| puntosTabla | objeto | victoria, empate, derrota, bonusTries (cantidad y puntos), bonusDerrotaCorta (diferencia y puntos). Presets: 3-2-1 y 4-2-0 con bonus |
| ordenDesempates | lista de enum | RESULTADO\_DIRECTO, DIFERENCIA, PUNTOS\_A\_FAVOR, TRIES\_A\_FAVOR, BUCHHOLZ, SORTEO |
| marcadorWO | objeto | ganador (default 28), perdedor (default 0) |
| bye | objeto | puntosTabla como victoria (sí/no), suma puntos a favor (default no) |
| minJugadoresEquipo | int | Default 7 |
| maxJugadoresEquipo | int o null | Default 12, solo genera aviso |
| duracionPartidoMin | int | Para horarios tentativos |
| descansoMin | int | Entre partidos |
| horaInicio | datetime | Primer partido |
| intervaloRespaldoMin | int | Default 5 |
| versionEsquema | int | Para migraciones y archivo de guardado |
| creadoEn, actualizadoEn | datetime |  |

### 3.2 Jugador

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | string |  |
| nombre, apellido | string | Obligatorios |
| categoria | string | Valor del catálogo de categorías (sección 3.9). Obligatorio |
| genero | enum | M o F. Obligatorio |
| equipoId | string o null | Opcional. Null = jugador suelto |
| aclaracion | string o null | Para homónimos, ej. «(2)» |
| claveNormalizada | string (derivado, indexado) | nombre + apellido + categoría sin tildes, sin mayúsculas, sin espacios de más |

### 3.3 Equipo

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | string |  |
| nombre | string | Único (comparación normalizada) |
| colorPrimario, colorSecundario | string | `#RRGGBB` |
| capitanId | string o null | Debe ser jugador del equipo |
| logo | string o null | Reservado, sin pantalla en el MVP |
| cabezaDeSerie | boolean |  |
| estado | enum | ACTIVO, RETIRADO |
| cantidadJugadores | int (derivado) |  |

### 3.4 Fase, Grupo y Partido

**Fase:** id, tipo (GRUPOS, LIGA, ELIMINACION, COPA, SUIZO, LLAVE\_GANADORES, LLAVE\_PERDEDORES, FINAL, CRUCES\_POSICION), nombre, orden, copa (ORO, PLATA, BRONCE... o null), parametros.

**Grupo:** id, faseId, nombre (A, B, C...), equipoIds (lista ordenada).

**Partido:**

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | string |  |
| faseId, grupoId | string | grupoId opcional |
| ronda | int |  |
| orden | int | Posición global en el fixture (reordenable en pendientes) |
| localRef, visitanteRef | referencia | EQUIPO(equipoId), POSICION\_GRUPO(grupoId, pos), POSICION\_NIVEL(nivel, pos), GANADOR(partidoId), PERDEDOR(partidoId), BYE |
| localEquipoId, visitanteEquipoId | string o null (derivado) | Resolución de las referencias |
| estado | enum | PENDIENTE, EN\_JUEGO, FINALIZADO |
| modoResultado | enum o null | DETALLE, DIRECTO, WO |
| puntosLocal, puntosVisitante | int o null | Se guardan al finalizar |
| definicion | enum o null | REGULAR, MUERTE\_SUBITA, WO |
| ganadorEquipoId | string o null | Obligatorio si definicion es MUERTE\_SUBITA o WO |
| horaInicioReal, horaFinReal | datetime o null |  |
| horaTentativa | datetime (derivado) | Cronograma |

### 3.5 EventoPartido

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | string |  |
| partidoId | string |  |
| equipoId | string | Debe ser uno de los dos equipos del partido |
| tipo | enum | TRY, CONVERSION |
| jugadorId | string o null | Null = sin autor. Si hay jugador, debe pertenecer al equipo |
| creadoEn | datetime | Orden del registro |

### 3.6 Sorteo, EstadoProyector y Respaldo

**Sorteo:** id, tipo (GRUPOS, EQUIPOS, LLAVE, DESEMPATE, BYE), contexto (qué se sorteó), resultado (JSON), semilla, fecha.

**EstadoProyector:** vistaForzada (enum o null), mensaje (string o null), temporizador (nombre, finEpochMs) o null.

**Respaldo:** id, creadoEn, motivo (INICIO\_TORNEO, CIERRE\_PARTIDO, PERIODICO, ANTES\_DE\_CARGAR, MANUAL), snapshot (JSON completo). Se conservan los últimos 10.

### 3.7 Relaciones

- Equipo 1—N Jugador (opcional del lado del jugador).
- Equipo 0—1 Jugador (capitán).
- Fase 1—N Grupo, Fase 1—N Partido, Grupo 1—N Partido.
- Partido 1—N EventoPartido. Partido N—1 Equipo (dos veces, por resolución).
- Jugador 1—N EventoPartido (opcional).

### 3.8 Invariantes de datos

1. Clave única de jugador: `claveNormalizada` (salvo confirmación de homónimo, que agrega `aclaracion`).
2. Nombre de equipo único.
3. El capitán pertenece al equipo. Si se mueve o borra al capitán, el cargo queda vacío y se avisa.
4. A lo sumo un partido EN\_JUEGO.
5. En modo DETALLE: puntos de cada equipo = 5 · tries + 2 · conversiones, y conversiones ≤ tries por equipo.
6. Partido FINALIZADO con empate en fase de eliminación: `definicion` = MUERTE\_SUBITA y `ganadorEquipoId` definido.
7. Partido de eliminación no puede pasar a EN\_JUEGO si algún lado no está resuelto.
8. Con el torneo EN\_CURSO no se agregan ni quitan equipos y no se cambia el formato.
9. Derivados (no se guardan): posiciones, goleadores, clasificados, resolución de referencias, horarios tentativos.

### 3.9 Catálogo de categorías

Las categorías salen de un catálogo configurable (guardado en el torneo como `categoriasValidas`), no de un patrón de texto.

- **Infantil:** Escuelita, M7, M8, M9, M10, M11, M12.
- **Juvenil:** M13, M14, M15, M16, M17, M18, M19.
- **Adulto:** Plantel Superior, Veteranos.
- Cada categoría tiene alias para normalizar la importación (por ejemplo «Sub16», «M 16» y «16» para M16).
- Una categoría fuera del catálogo es un error en la importación, con la opción de agregarla.
- El género (M o F) se pide siempre, también en Escuelita e infantiles.
- **Equipos A, B y C:** son parte del nombre del equipo («M16 A», «M16 B»), no un campo aparte. La categoría pertenece al jugador.
- **Mezclar etapas es válido:** un equipo puede tener jugadores de cualquier categoría y género. Como mucho se muestra un aviso informativo, nunca un bloqueo.
- La categoría y el género se usan para filtros y estadísticas (por ejemplo, goleadores de M16 o solo femenino). No separan el torneo.

## 4. Backlog de Historias de Usuario

### 4.1 Convenciones y hoja de ruta

- **Prioridad:** Must (MVP), Should (muy recomendable), Could (si hay tiempo).
- **Orden:** el listado está en orden de desarrollo sugerido. Cada HU indica de qué depende.
- **Criterios de aceptación:** técnicos y verificables. Toda regla de dominio se implementa en `domain/` con tests unitarios antes de conectarla a la UI.
- **Mensajes:** toda advertencia o decisión no obvia muestra una explicación en lenguaje claro (ver HU-58).

| Hito | Contenido | Épicas |
| --- | --- | --- |
| 1 | Fundaciones, jugadores y equipos | E0, E1 |
| 2 | Motor de reglas: marcador, tablas, desempates, goleadores | E2 |
| 3 | Formatos base y fixture | E3 |
| 4 | Operación del torneo (resultados, edición, W.O., retiros) | E4 |
| 5 | Proyector y respaldo | E5, E6 |
| 6 | Suizo y doble eliminación | E7 |
| 7 | Pulido y transversales | E8 |

---

## Épica E0: Fundaciones técnicas

**HU-01: Spike de despliegue plug and play** · Must · Depende de: —

*Como desarrollador, quiero validar temprano que la app corre offline en las máquinas reales, para no descubrir un problema de despliegue el día del torneo.*

Criterios de aceptación:

- App Angular mínima publicada en GitHub Pages con hash routing y service worker.
- Tras una primera visita con internet, la app abre sin conexión (modo avión) en Chrome y Edge, sobre Windows y Ubuntu. Se muestra un indicador «Listo para usar sin conexión».
- Se escribe y lee IndexedDB con Dexie y los datos sobreviven a cerrar y reabrir el navegador. `navigator.storage.persist()` se solicita y el resultado queda registrado.
- `/proyector` abre en ventana nueva con `window.open` y recibe mensajes por `BroadcastChannel` en menos de 500 ms. Se prueba en un segundo monitor.
- Caso borde: si el navegador bloquea el popup, se muestra una instrucción para permitirlo.
- Se documenta el resultado. Si algo falla, se evalúa el Plan B (zip portable o HTML único) y se decide antes de seguir.

**HU-02: Esqueleto del proyecto y capa de dominio pura** · Must · Depende de: HU-01

*Como desarrollador, quiero una estructura de proyecto con el dominio aislado, para poder testear las reglas sin navegador.*

Criterios de aceptación:

- Carpetas `domain/`, `data/`, `import/`, `sync/`, `app/`.
- Regla de lint que prohíbe en `domain/` imports de `@angular/*` y el uso de `window`, `document` e `indexedDB`.
- Vitest ejecutándose en CI. Pipeline de GitHub Actions: test, build y deploy a Pages.
- Utilidades inyectables `Rng` (con semilla) y `Clock`. Ninguna función de dominio usa `Math.random` ni `Date.now` directamente.
- Tipos TypeScript del modelo de la sección 3.

**HU-03: Persistencia y autoguardado** · Must · Depende de: HU-02

*Como organizador, quiero que todo lo que cargo se guarde solo, para no perder nada si se cierra el navegador o se corta la luz.*

Criterios de aceptación:

- Repositorio sobre Dexie con esquema versionado y migraciones (`versionEsquema`).
- Cada operación de dominio se persiste en una transacción atómica. Ejemplo: partido y eventos se guardan juntos. Si falla, se hace rollback y se muestra un error visible.
- Al abrir la app con un torneo existente, se carga y se vuelve a la última pantalla. Sin torneo, pantalla de bienvenida.
- Indicador «Guardado hh:mm:ss» siempre visible en el panel.
- Si IndexedDB no está disponible (modo privado), advertencia bloqueante con instrucciones.
- `navigator.storage.persist()` se pide al crear el torneo. Si lo deniegan, aviso suave recomendando guardar archivos de respaldo.

---

## Épica E1: Jugadores y equipos

**HU-04: Alta, edición y baja de jugador** · Must · Depende de: HU-03

*Como organizador, quiero cargar, editar y borrar jugadores a mano, para completar inscripciones sin planilla.*

Criterios de aceptación:

- Campos: nombre, apellido, categoría (se elige del catálogo de categorías, ver 3.9), género (M o F) y equipo (opcional). Los cuatro primeros son obligatorios. El género se pide siempre, también en categorías infantiles.
- Se aplica trim y se colapsan espacios múltiples. Se capitaliza el nombre al guardar.
- Si la clave normalizada ya existe, se dispara el flujo de HU-07.
- Lista con búsqueda por texto, filtros (equipo, sueltos, categoría, género) y contador total.
- Borrar un jugador con eventos registrados: advertencia. Sus eventos pasan a «sin autor» y los puntos del partido no cambian.
- Si el jugador es capitán, rige HU-05.
- Editable en cualquier estado del torneo.

**HU-05: Alta, edición y baja de equipo** · Must · Depende de: HU-04

*Como organizador, quiero crear equipos con nombre, dos colores y capitán, para identificarlos en el panel y el proyector.*

Criterios de aceptación:

- Nombre único (comparación normalizada, sin mayúsculas ni tildes). Dos colores `#RRGGBB` con valores por defecto distintos. Marca de cabeza de serie.
- Capitán: se elige solo entre los jugadores del equipo. Si se mueve o borra al capitán, aviso y el cargo queda vacío.
- Contador de jugadores con semáforo: menos que el mínimo (rojo, solo advertencia), más que el máximo (amarillo, solo aviso). Ninguno bloquea.
- Equipo mixto en categoría o género: aviso informativo, no bloquea.
- Si los dos colores son casi iguales, aviso de legibilidad.
- Borrar equipo: solo con el torneo en CONFIGURACION o FIXTURE\_GENERADO. Sus jugadores quedan sueltos. Si ya había fixture, se avisa que hay que regenerarlo.
- Con el torneo EN\_CURSO no se crean ni borran equipos (ver HU-40 para retiros). Sí se editan nombre, colores y capitán.
- El campo `logo` existe en el modelo pero no tiene pantalla.

**HU-06: Asignación de jugadores a equipos** · Must · Depende de: HU-05

*Como organizador, quiero mover jugadores entre sueltos y equipos, para armar y corregir planteles rápido.*

Criterios de aceptación:

- Vista de dos paneles (sueltos y equipo seleccionado). Mover uno o varios jugadores con multiselección.
- Mover entre equipos y volver a «sueltos». Si el jugador era capitán, aviso y cargo vacío.
- Siempre se permite, también con el torneo EN\_CURSO.
- Los eventos ya registrados conservan `equipoId` del momento y la autoría histórica.
- Se muestra el estado de cada equipo respecto al mínimo y máximo.

**HU-07: Manejo de homónimos** · Must · Depende de: HU-04

*Como organizador, quiero distinguir dos jugadores con el mismo nombre, categoría y apellido, para no perder a ninguno.*

Criterios de aceptación:

- Clave de comparación: nombre + apellido + categoría, sin mayúsculas, sin tildes y sin espacios de más. `Juan  Pérez M16` equivale a `juan perez m16`.
- Ante un duplicado se muestra un diálogo con ambos registros y dos opciones: «Es la misma persona» (cancela el alta o actualiza el existente) y «Son personas distintas».
- Si son distintas se guarda con `aclaracion` autogenerada («(2)», «(3)») editable. En listas se muestra «Juan Pérez (2)».
- La misma lógica se reutiliza en la importación (HU-11).
- Tests unitarios de normalización: tildes, mayúsculas, espacios, apóstrofes y guiones en apellidos.

**HU-08: Importación, lectura del archivo** · Must · Depende de: HU-04

*Como organizador, quiero subir una planilla CSV o Excel, para no cargar 120 jugadores a mano.*

Criterios de aceptación:

- Acepta `.csv`, `.xlsx` y `.xls` por arrastrar y soltar o selector. Otros formatos: error claro.
- CSV: detección automática de delimitador (`,` `;` tab) y de codificación (UTF-8 con y sin BOM, Windows-1252, ISO-8859-1). Se muestran las primeras 5 filas decodificadas. Si hay caracteres rotos, el usuario puede forzar codificación y delimitador manualmente.
- Excel: lee la primera hoja y ofrece un selector si hay varias. Ignora filas totalmente vacías. Todas las celdas se leen como texto.
- Advertencia si el archivo supera las 2000 filas. Mensaje claro si el archivo está vacío o no tiene encabezados.
- Esta etapa no escribe nada en la base.

**HU-09: Importación, mapeo de columnas y plantilla** · Must · Depende de: HU-08

*Como organizador, quiero indicar qué columna de mi planilla es cada dato, para que funcione aunque los encabezados no coincidan.*

Criterios de aceptación:

- Para cada campo (nombre, apellido, categoría, género, equipo) un selector de columna, con sugerencia automática por similitud del encabezado.
- Si la planilla trae el nombre completo en una columna, se ofrece separarlo por coma o por el primer espacio, y el resultado se ve en la vista previa.
- No se avanza si falta mapear un campo obligatorio. Equipo es opcional.
- Botón «Descargar plantilla»: CSV con encabezados y dos filas de ejemplo, separador `;` y UTF-8 con BOM para que Excel lo abra bien.
- Se recuerda el último mapeo (por nombres de encabezado) para reimportar.

**HU-10: Importación, normalización y vista previa** · Must · Depende de: HU-09, HU-07

*Como organizador, quiero revisar y corregir las filas antes de confirmar, para no ensuciar la base con errores.*

Criterios de aceptación:

- Normalización de categoría contra el catálogo (3.9): `m16`, `M 16`, `Sub16`, `sub-16` y `16` pasan a `M16`. `m7`, `Sub 7` y `7` pasan a `M7`. `escuelita` pasa a `Escuelita`. `Primera`, `Intermedia` y `Preintermedia` pasan a `Plantel Superior`, y `vet` o `+35` pasan a `Veteranos` (siempre se muestra el valor original junto al normalizado). Una categoría que no está en el catálogo es un error, con la opción de agregarla. Normalización de género: `Masc`, `Masculino`, `Varón`, `M` pasan a `M`. `Fem`, `Femenino`, `Mujer`, `F` pasan a `F`.
- Cada fila queda en un estado: **OK**, **Advertencia** (duplicado, equipo nuevo, equipo parecido a uno existente) o **Error** (falta un obligatorio, categoría o género no reconocidos).
- Se muestra el valor original junto al normalizado («Sub16 → M16») para poder auditar.
- Edición de cada celda en la misma tabla, con revalidación inmediata. Descarte de filas.
- Contadores (total, OK, advertencias, errores) y filtro por estado.
- Duplicados dentro del mismo archivo: se marcan. Por defecto se descarta la segunda y se puede marcar «persona distinta».
- El botón Confirmar está deshabilitado mientras queden errores sin resolver.

**HU-11: Importación, confirmación, equipos nuevos y reimportación** · Must · Depende de: HU-10

*Como organizador, quiero confirmar la importación y que los equipos se creen o se unifiquen bien, para dejar todo listo para armar el fixture.*

Criterios de aceptación:

- Antes de escribir, se genera un respaldo automático (motivo `ANTES_DE_CARGAR`). La escritura es una única transacción: todo o nada.
- Equipos del archivo que no existen se crean con colores por defecto y sin capitán.
- Nombres parecidos (misma cadena normalizada, o distancia de edición menor o igual a 2): se propone unificar con el equipo existente, caso por caso. Ejemplo: «Los Teros» y «los teros ».
- Jugadores con equipo se asignan. Sin equipo quedan sueltos.
- Duplicados contra la base: por fila se elige omitir (por defecto), actualizar equipo o «persona distinta».
- Resumen final: creados, omitidos, equipos nuevos y equipos por debajo del mínimo (advertencia, no error).
- Se puede reimportar en cualquier momento (inscripciones tardías). Con torneo EN\_CURSO los jugadores nuevos entran como sueltos o en equipos existentes, nunca crean equipos.

**HU-12: Sorteo de jugadores sueltos en equipos** · Should · Depende de: HU-13, HU-05

*Como organizador, quiero sortear los jugadores sueltos en equipos parejos, para armar equipos rápido cuando no vienen armados.*

Criterios de aceptación:

- Entrada: cantidad de equipos a crear (o equipos existentes a completar). Respeta los equipos ya armados y no los modifica.
- Reparto parejo: los planteles nuevos difieren como máximo en 1 jugador y cumplen el mínimo. Si no alcanza para la cantidad pedida, se informa el máximo posible.
- Opción (desactivada por defecto) de balancear por categoría y género repartiendo cada grupo en rondas, útil cuando se mezclan etapas.
- Vista previa del resultado: confirmar o repetir. Al confirmar se guarda (Sorteo tipo EQUIPOS) y se crean los equipos, editables y con colores por defecto. Nombres: «Equipo 1..n», o «M16 A», «M16 B», «M16 C» si se sortea una sola categoría.
- Con torneo EN\_CURSO la función está deshabilitada.

**HU-13: Calculadora de capacidad de equipos** · Must · Depende de: HU-04

*Como organizador, quiero saber cuántos equipos puedo armar con los jugadores inscriptos, para decidir el formato.*

Criterios de aceptación:

- Entrada: total de jugadores, mínimo y máximo por equipo (configurables).
- Salida: rango de cantidad de equipos posibles, desde `ceil(J / máx)` hasta `floor(J / mín)`. Para cada cantidad, el reparto resultante. Ejemplo: 53 jugadores en 6 equipos son 5 de 9 y 1 de 8.
- Si J es menor que el mínimo: mensaje «no alcanza para un equipo».
- Con equipos ya armados usa los reales: muestra cuántos hay, cuántos jugadores sueltos quedan y cuántos equipos más se pueden formar.
- La cantidad elegida alimenta el asistente de formato (HU-20).
- Implementación pura en `domain/`.

---

## Épica E2: Motor de reglas (marcador, posiciones, desempates, goleadores)

**HU-14: Configuración de reglas del torneo** · Must · Depende de: HU-03

*Como organizador, quiero configurar puntos, desempates y tiempos, para adaptar el torneo al reglamento que uso.*

Criterios de aceptación:

- Campos: nombre, fecha, puntos de tabla con presets (3-2-1, 4-2-0 con bonus, personalizado), bonus (cantidad de tries y diferencia de derrota corta configurables), orden de desempates, marcador de W.O. (default 28-0), tratamiento del bye, mínimo y máximo de jugadores, duración del partido, descanso y hora de inicio.
- Orden de desempates: lista reordenable. El sorteo siempre queda último y no se puede quitar. Los criterios disponibles son resultado directo, diferencia de puntos, puntos a favor, tries a favor y Buchholz (solo se ofrece con formato suizo).
- Validaciones: enteros mayores o iguales a 0. Advertencia (no bloqueo) si la victoria vale menos que el empate.
- Con el torneo EN\_CURSO, cambiar puntos o desempates muestra «esto cambia posiciones, se recalcula todo» y, si afecta clasificados, aplica el flujo de HU-38.

**HU-15: Marcador a partir de eventos** · Must · Depende de: HU-14

*Como organizador, quiero que el marcador salga de los tries y conversiones registrados, para no sumar a mano.*

Criterios de aceptación:

- Puntos = 5 por try + 2 por conversión, función pura en `domain/`.
- Alta de evento: tipo, equipo, jugador opcional y opción «sin autor».
- El jugador debe pertenecer al equipo que anota. Si no, el selector no lo ofrece.
- Validación: conversiones menores o iguales a tries por equipo. El botón de conversión se deshabilita sin tries disponibles.
- Quitar un try que dejaría más conversiones que tries se bloquea con un mensaje que indica quitar primero la conversión.
- Editar o borrar un evento recalcula el marcador al instante.
- Un partido 0 a 0 es válido en fase de grupos o liga.

**HU-16: Tabla de posiciones** · Must · Depende de: HU-15

*Como organizador, quiero ver la tabla de cada grupo o liga actualizada, para saber cómo viene cada equipo.*

Criterios de aceptación:

- Columnas: PJ, PG, PE, PP, PF, PC, DP, tries a favor, bonus y puntos.
- Solo cuentan partidos FINALIZADOS. Los W.O. cuentan con el marcador configurado y el bye según la configuración.
- Equipos retirados permanecen en la tabla con la marca «Retirado».
- Función pura `calcularTabla(partidos, reglas)`, sin estado guardado.
- Tests: sin partidos, grupo de 2 equipos, empates múltiples, bonus, W.O. y bye.

**HU-17: Desempates configurables y transparentes** · Must · Depende de: HU-16

*Como organizador, quiero que los empates en la tabla se resuelvan por reglas claras y que el sistema me diga cuál usó, para poder explicárselo a los equipos.*

Criterios de aceptación:

- Se aplican en el orden configurado: resultado directo, diferencia de puntos, puntos a favor, tries a favor, Buchholz (si aplica) y sorteo.
- Entre 2 equipos, resultado directo es quién ganó el partido entre ellos. Si no jugaron o empataron, se pasa al siguiente criterio.
- Entre 3 o más: mini-tabla solo con los partidos entre ellos. Si desempata a algunos, los que sigan igualados vuelven a aplicar los criterios desde el principio (sobre ese subconjunto).
- Cada fila de la tabla guarda `criterioDesempate` y la UI muestra «Desempate: diferencia de puntos» con un detalle de los valores comparados.
- Sorteo: se registra (Sorteo tipo DESEMPATE) con los equipos involucrados y no cambia al refrescar ni recalcular. Si por una edición cambia el conjunto de equipos empatados, el sorteo se invalida y se vuelve a realizar.
- Tests con tablas de 2, 3 y 4 equipos empatados y con resultado directo circular (A gana a B, B a C, C a A).

**HU-18: Comparación entre grupos y grupos desparejos** · Must · Depende de: HU-17

*Como organizador, quiero comparar equipos de grupos distintos con justicia, para definir mejores segundos y siembras.*

Criterios de aceptación:

- Para una posición p, se rankean los equipos de esa posición de todos los grupos por puntos de tabla, diferencia de puntos, puntos a favor y tries a favor. Se omite resultado directo.
- Grupos desparejos: se descartan los partidos contra el último de cada grupo de más equipos, según la tabla del grupo con desempates ya aplicados.
- La UI muestra un aviso con la regla y una vista «Tabla comparativa» donde se ve qué partidos se descartaron.
- Mientras falten partidos en algún grupo, la comparación se marca como provisoria.
- Tests con la configuración 4-4-3 y con 5-4-4-4.

**HU-19: Tabla de goleadores** · Must · Depende de: HU-15

*Como organizador, quiero ver quién anotó más tries y puntos, para premiar y anunciar.*

Criterios de aceptación:

- Ranking por jugador: equipo, tries, conversiones y puntos (5 por try + 2 por conversión). Orden por puntos, luego tries, luego apellido.
- Pestañas: puntos, tries y conversiones.
- Los eventos sin autor y los partidos en modo DIRECTO o W.O. no suman. Se muestra una nota informativa «N tries sin autor».
- Filtros por categoría y género. Los homónimos se muestran con su aclaración.
- Se calcula siempre a partir de los eventos, nunca se guarda.

---

## Épica E3: Configuración de formato y fixture

**HU-20: Catálogo y asistente de formato** · Must · Depende de: HU-13, HU-14

*Como organizador, quiero ver los formatos posibles para mi cantidad de equipos con sus partidos y duración, para elegir el que mejor se adapta.*

Criterios de aceptación:

- Entrada: cantidad de equipos (los reales, editable para simular) y duración de partido.
- Una tarjeta por formato viable con: nombre, descripción en lenguaje claro (textos de la sección 2), parámetros sugeridos, total de partidos, mínimo de partidos por equipo, duración total estimada (partidos × (duración + descanso)) y advertencias.
- Un formato no viable para esa cantidad de equipos aparece deshabilitado con el motivo. Ejemplos: suizo con menos de 4 equipos, doble eliminación con menos de 3.
- Comparación lado a lado de hasta 3 formatos.
- Los cálculos son funciones puras con tests contra casos conocidos (8 equipos todos contra todos = 28 partidos, 8 equipos en eliminación directa = 7, 8 equipos en doble eliminación = 14 o 15).
- Elegir un formato lo guarda en el torneo pero no genera el fixture.
- La descripción de cada formato se puede consultar en cualquier momento con un ícono de ayuda.

**HU-21: Parámetros del formato y validaciones** · Must · Depende de: HU-20

*Como organizador, quiero ajustar los parámetros del formato y ver al instante el efecto, para encontrar la mejor configuración.*

Criterios de aceptación:

- Parámetros según la tabla de la sección 2.8. Al cambiar uno se recalculan en vivo total de partidos, mínimo por equipo y duración.
- Grupos y equipos por grupo: se sugiere el reparto automático. Ejemplo: 11 equipos en 3 grupos da 4-4-3, con aviso de grupo desparejo y la regla aplicada (HU-18). Se ofrecen alternativas, por ejemplo «2 grupos (6-5)».
- Clasificados por grupo no puede superar el tamaño del grupo más chico. Si el total de clasificados no es potencia de 2, se informa cuántos byes habrá y quiénes los reciben.
- Rondas del suizo: de 1 a n−1. Advertencia si son menos de ⌈log₂ n⌉, porque puede no definirse un campeón claro.
- Errores que bloquean: menos de 2 equipos, más grupos que la mitad de los equipos, clasificados en 0.
- Cada parámetro tiene una descripción visible.

**HU-22: Cabezas de serie y sorteo de grupos** · Must · Depende de: HU-21

*Como organizador, quiero marcar cabezas de serie y sortear los grupos, para evitar que los mejores equipos queden juntos.*

Criterios de aceptación:

- Marca de cabeza de serie desde la lista de equipos o desde el sorteo.
- Reglas de reparto según la sección 2.8: una cabeza por grupo, por tandas si hay más cabezas que grupos, resto libre respetando el tamaño de cada grupo.
- Botones «Sortear» y «Repetir sorteo». Cada resultado se guarda con su semilla (Sorteo tipo GRUPOS) y es reproducible.
- Ajuste manual: mover un equipo entre grupos. Se valida que los tamaños sigan siendo válidos para el formato.
- Antes de confirmar se muestra una explicación: «Cabezas de serie: A1, B1, C1. Grupos desparejos: C tiene un equipo menos».
- Con cabezas de serie en eliminación directa o en la primera ronda del suizo, se aplica la regla correspondiente de la sección 2.
- Solo se puede sortear con el torneo en CONFIGURACION o FIXTURE\_GENERADO.

**HU-23: Generador de fixture, todos contra todos** · Must · Depende de: HU-22

*Como organizador, quiero generar el fixture de todos contra todos, para tener todos los partidos y su orden.*

Criterios de aceptación:

- Método del círculo. Con cantidad impar de equipos, un equipo descansa por ronda (se muestra «Libre» y no es un partido).
- Con 2 vueltas, la segunda repite las rondas con local y visitante invertidos.
- Cada par de equipos se enfrenta exactamente `v` veces. Ningún equipo juega dos veces en la misma ronda. La diferencia entre partidos de local y de visitante es menor o igual a 1 por equipo.
- El total de partidos coincide con `v · n(n−1)/2`.
- Se reutiliza para la fase de grupos de otros formatos (un fixture por grupo).
- Tests para n = 3, 4, 5, 6, 8 y v = 1, 2.

**HU-24: Generador de eliminación directa con byes y siembra** · Must · Depende de: HU-22

*Como organizador, quiero una llave de eliminación con byes bien repartidos, para que el cuadro sea justo con cualquier cantidad de equipos.*

Criterios de aceptación:

- Tamaño de llave = potencia de 2 mayor o igual a n. Byes = tamaño − n, para los mejores sembrados.
- Siembra estándar (1 contra P, 2 contra P−1, etc.) de modo que el 1 y el 2 solo se crucen en la final.
- Sin siembra, el orden sale de un sorteo guardado. Con cabezas de serie, se siembran primero.
- Un partido con bye no cuenta como partido: el equipo avanza solo y la UI muestra «pasa por bye».
- Partido por el 3er puesto opcional entre los perdedores de semifinales (requiere al menos 4 equipos).
- Los partidos usan referencias `GANADOR(partidoId)`.
- Se reutiliza como componente en copas y grupos + eliminación.
- Tests para n = 2, 3, 5, 6, 8 y 13.

**HU-25: Generador, grupos + eliminación directa** · Must · Depende de: HU-23, HU-24, HU-18

*Como organizador, quiero que los mejores de cada grupo pasen a una llave de eliminación, para definir al campeón.*

Criterios de aceptación:

- Fase de grupos con un fixture por grupo (HU-23) y fase de eliminación con referencias `POSICION_GRUPO(grupo, pos)`.
- Siembra de la llave según 2.2: primero los primeros de grupo, luego los segundos, ordenados con la comparación de HU-18.
- En la primera ronda se evita el cruce de equipos del mismo grupo cuando es posible, intercambiando posiciones. Si es imposible, se explica por qué.
- Orden global: primero partidos de grupos (intercalados por ronda), luego eliminación.
- Tests: 8 equipos en 2 grupos de 4 con 2 clasificados, y 11 equipos en 3 grupos con 2 clasificados (con byes).

**HU-26: Generador, grupos + copas** · Must · Depende de: HU-25

*Como organizador, quiero que cada posición de grupo juegue su propia copa, para que todos tengan partidos importantes hasta el final.*

Criterios de aceptación:

- Después de los grupos, los equipos de la posición 1 van a la Copa de Oro, los de la posición 2 a la de Plata, y así sucesivamente.
- Cada copa es una eliminación directa (HU-24) con byes por siembra y 3er puesto opcional.
- Grupos desparejos: la última copa tiene menos equipos, se arma con los que haya y se explica.
- Copas de 1 equipo no se generan. Copas de 2 equipos son una final.
- Cada copa tiene sus propias posiciones finales.
- Después de todas las rondas previas, las finales se juegan de menor a mayor copa: Cobre, Bronce, Plata y Oro (y luego las copas numeradas, si existen).

**HU-27: Generador, grupos + cruces de posiciones** · Should · Depende de: HU-25

*Como organizador, quiero que se definan todas las posiciones finales con cruces entre equipos de igual posición, para tener un ranking completo.*

Criterios de aceptación:

- Con 2 grupos: 1°A vs 1°B define 1° y 2°, 2°A vs 2°B define 3° y 4°, y así hasta el último nivel.
- Con 3 o más grupos: cada nivel (equipos de la misma posición) juega todos contra todos si tiene hasta 4 equipos, y eliminación directa si tiene más. **Decisión a validar al implementar.**
- Grupos desparejos: el último nivel tiene menos equipos y se explica.
- Posiciones finales: nivel 1 define 1°..g°, nivel 2 define las siguientes, etc.

**HU-28: Resolución de cruces** · Must · Depende de: HU-18, HU-24

*Como organizador, quiero que los cruces se completen solos según los resultados, para no armar llaves a mano.*

Criterios de aceptación:

- Función pura que convierte referencias en equipos: `POSICION_GRUPO` se resuelve cuando el grupo está completo (y, si el cruce compara grupos, cuando todos los grupos relevantes lo están). `GANADOR` y `PERDEDOR` se resuelven cuando el partido está FINALIZADO y tiene ganador definido.
- Mientras no se resuelve, la UI muestra texto descriptivo: «1° Grupo A», «Ganador partido #14».
- Un partido con una referencia `BYE` hace avanzar al rival automáticamente.
- Un partido con algún lado sin resolver no puede pasar a EN\_JUEGO (invariante 7).
- El resultado se recalcula siempre desde cero. Nunca se guardan equipos resueltos.
- Tests: grupo completo e incompleto, empate sin definir, edición posterior.

**HU-29: Cronograma tentativo y orden de cancha** · Must · Depende de: HU-28

*Como organizador, quiero horarios estimados que se corran solos, para anunciar a qué hora juega cada equipo sin esfuerzo.*

Criterios de aceptación:

- Hora tentativa = base + suma de (duración + descanso) de los partidos anteriores pendientes. La base es la hora de fin real del último partido finalizado, o, si hay uno EN\_JUEGO, el máximo entre su inicio más la duración y la hora actual.
- Se recalcula tras cada cambio de estado. Siempre se rotula «tentativa».
- **Pausas programadas** (ej. almuerzo de 45 min) que se insertan entre partidos y desplazan los horarios siguientes.
- Orden de cancha: heurística que minimiza que un mismo equipo juegue partidos consecutivos y maximiza el descanso mínimo. Se informa el descanso mínimo por equipo y se avisa «Equipo X juega 2 seguidos» cuando no es evitable.
- Los partidos de eliminación se ordenan por ronda, respetando dependencias.
- Para el suizo, las rondas futuras se muestran como «estimada» (el fixture no existe aún).

**HU-30: Reordenar partidos pendientes** · Must · Depende de: HU-29

*Como organizador, quiero adelantar o atrasar partidos pendientes, para adaptarme a los imprevistos.*

Criterios de aceptación:

- Arrastrar y soltar, o botones subir y bajar, solo sobre partidos PENDIENTES.
- No se puede mover un partido antes de uno FINALIZADO o EN\_JUEGO. No se puede poner un partido de eliminación antes de partidos de los que depende (bloqueo con el motivo).
- Se recalculan los horarios y se avisa si el nuevo orden hace jugar consecutivamente a un equipo.
- Persiste `orden`. Botón «Restablecer orden sugerido».

**HU-31: Fixture: generación, vista y regeneración previa al inicio** · Must · Depende de: HU-23 a HU-29

*Como organizador, quiero generar y revisar el fixture, para ajustarlo antes de empezar.*

Criterios de aceptación:

- «Generar fixture» crea fases, grupos y partidos, y el torneo pasa a FIXTURE\_GENERADO.
- Antes de iniciar se puede regenerar o cambiar el formato sin costo. Se pide confirmación y se borran el fixture y los sorteos asociados. Equipos y jugadores se conservan.
- Vista por fase y ronda con estado, resultado y cruces «a definir».
- Resumen: partidos totales, mínimo por equipo, duración estimada y equipos con descanso corto.
- Advertencia (no bloqueo) si hay equipos por debajo del mínimo. Bloqueo si hay menos de 2 equipos.

---

## Épica E4: Operación del torneo

**HU-32: Iniciar torneo (candado)** · Must · Depende de: HU-31

*Como organizador, quiero un hito claro de inicio, para que la estructura del torneo quede protegida de cambios accidentales.*

Criterios de aceptación:

- En el Home, «Iniciar torneo» pide confirmación y explica el candado; solo está disponible con un fixture generado.
- Al confirmar: estado EN\_CURSO y respaldo con motivo `INICIO_TORNEO`. No cambia el estado de ningún partido; la mesa de control los pone en juego (HU-33).
- Con el torneo EN\_CURSO: no se agregan ni quitan equipos, no se cambia el formato y no se regenera el fixture. Siguen editables jugadores, capitanes, colores, nombres y resultados.
- Los controles bloqueados se ven deshabilitados con una explicación («para cambiar esto hay que reiniciar el torneo», ver HU-59).

**HU-33: Panel de control, partido actual y próximo** · Must · Depende de: HU-32

*Como organizador, quiero ver de un vistazo qué se juega y qué sigue, para manejar la mesa de control sin pensar.*

Criterios de aceptación:

- Vista principal: partido EN\_JUEGO (marcador y eventos), próximo partido y lista de los siguientes con hora tentativa.
- Acciones «Poner en juego» (PENDIENTE a EN\_JUEGO) y «Finalizar».
- Solo puede haber un partido EN\_JUEGO. Si ya hay uno, se bloquea con mensaje.
- Un partido con equipos sin resolver no se puede poner en juego.
- Si el próximo en el orden no es jugable por dependencias, el panel propone el siguiente jugable sin alterar el orden.
- Se registra `horaInicioReal`.

**HU-34: Cargar resultado con detalle de tries y conversiones** · Must · Depende de: HU-15, HU-33

*Como organizador, quiero registrar cada try y conversión con su autor, para que el marcador y los goleadores salgan solos.*

Criterios de aceptación:

- Pantalla de mesa de control con dos columnas (una por equipo), botones grandes «Try» y «Conversión», selector de jugador con búsqueda por nombre y opción «Sin autor». Marcador en vivo.
- En el partido en curso y el próximo partido se indica la fase y, cuando corresponda, el grupo.
- Lista de eventos con deshacer individual.
- Cada evento se guarda al instante, sin esperar al cierre del partido.
- Se puede cargar con el partido EN\_JUEGO o al finalizar (partidos cargados después del hecho).
- «Finalizar» pide confirmación («¿Finalizar A 21 - 14 B?») y: marca FINALIZADO, guarda `horaFinReal`, genera respaldo `CIERRE_PARTIDO` y recalcula cruces y horarios.
- En fase de grupos un empate se puede finalizar. En eliminación se activa HU-36.

**HU-35: Marcador directo (sin detalle)** · Must · Depende de: HU-33

*Como organizador, quiero cargar solo el resultado final cuando no tengo el detalle, para no trabar la mesa de control.*

Criterios de aceptación:

- Opción «Cargar marcador sin detalle» con dos campos enteros mayores o iguales a 0.
- Se acepta cualquier entero (el árbitro puede haber sumado penales o drops). Aviso informativo si el valor no es alcanzable con tries y conversiones (por ejemplo 1 o 3).
- Estos partidos no suman a goleadores ni a «tries a favor».
- Si el criterio «tries a favor» se usa para desempatar y alguno de los equipos involucrados tiene partidos sin detalle, se muestra la advertencia «tries a favor incompleto: N partidos sin detalle».
- Pasar de DETALLE a DIRECTO descarta los eventos (con confirmación). Pasar de DIRECTO a DETALLE obliga a cargar los eventos desde cero y los puntos se recalculan.

**HU-36: Empate en eliminación y muerte súbita** · Must · Depende de: HU-34, HU-35

*Como organizador, quiero definir al ganador de un empate en eliminación, para poder avanzar la llave.*

Criterios de aceptación:

- En partidos de eliminación, copa, llaves y final no se puede finalizar un empate. Se ofrece «Definir por muerte súbita» y se elige al equipo ganador.
- El marcador de tiempo regular queda empatado. Se guardan `ganadorEquipoId` y `definicion = MUERTE_SUBITA`.
- La UI muestra «15 - 15 (definido por muerte súbita: Equipo X)». En proyector y tablas se ve el aviso.
- Si al editar luego el marcador deja de ser empate, se limpian `ganadorEquipoId` y `definicion` con aviso.
- El punto de muerte súbita no se registra como evento, no suma a goleadores.

**HU-37: W.O. (equipo no presentado)** · Must · Depende de: HU-33

*Como organizador, quiero marcar un W.O. con marcador automático, para resolver rápido un equipo ausente.*

Criterios de aceptación:

- Acción «W.O.» sobre un partido PENDIENTE: se elige el equipo ausente. El presente gana con el marcador configurado (default 28-0), `definicion = WO` y `modoResultado = WO`.
- Cuenta para la tabla (PF, PC, puntos) y avanza al presente en llaves. No suma a goleadores ni a tries.
- «Deshacer W.O.» devuelve el partido a PENDIENTE con confirmación.
- **Doble W.O.** (ninguno se presenta) queda fuera del MVP: se resuelve cargando marcador directo 0-0 en grupos o muerte súbita en eliminación.

**HU-38: Editar resultado y recálculo en cascada** · Must · Depende de: HU-28, HU-34

*Como organizador, quiero corregir un resultado ya cargado y que el sistema me avise qué cambia, para no romper el torneo sin darme cuenta.*

Criterios de aceptación:

- Se puede editar cualquier partido FINALIZADO (eventos, marcador, modo, definición).
- Antes de guardar, el dominio calcula el estado derivado nuevo y lo compara con el actual.
- Si no cambia ningún clasificado ni referencia resuelta, se guarda sin avisos.
- Si cambia, se muestra una lista de partidos afectados (transitiva) con equipos antes y después, estado actual y resultados que se perderían. Al confirmar, esos partidos pasan a PENDIENTE y se limpian marcador y eventos. Al cancelar no se guarda nada.
- Si un partido afectado está EN\_JUEGO, se vuelve a PENDIENTE con aviso destacado.
- Se genera un respaldo antes de aplicar y se ofrece «Deshacer última edición con cascada» restaurándolo.
- Si cambia el conjunto de equipos empatados por sorteo, se renueva el sorteo (HU-17) y cuenta como cambio de clasificados.
- Cambiar solo el autor de un evento no afecta cruces.
- Tests: edición que cambia un 2° y afecta semifinales, edición que no cambia posiciones, cascada de dos niveles.

**HU-39: Deshacer «En juego»** · Must · Depende de: HU-33

*Como organizador, quiero volver un partido a pendiente si lo arranqué por error, para no ensuciar el registro.*

Criterios de aceptación:

- EN\_JUEGO a PENDIENTE: se borra `horaInicioReal` y se pregunta si se conservan los eventos ya cargados.
- Si era el primer partido del torneo y nada más fue tocado, se ofrece volver el torneo a FIXTURE\_GENERADO (levanta el candado).
- El proyector vuelve a la vista de contexto anterior.

**HU-40: Equipo retirado** · Must · Depende de: HU-37

*Como organizador, quiero dar de baja a un equipo en mitad del torneo, para que el torneo siga sin trabarse.*

Criterios de aceptación:

- Acción «Retirar equipo» con torneo EN\_CURSO: `estado = RETIRADO`. Sus partidos PENDIENTES pasan a W.O. con el marcador configurado a favor del rival. En eliminación el rival avanza.
- Los partidos FINALIZADOS no se tocan.
- Si el equipo está en el partido EN\_JUEGO, primero hay que resolverlo (finalizar o W.O.).
- Si el rival también está retirado, rige el caso de doble W.O. (HU-37).
- En las tablas el equipo queda marcado «Retirado» y sus W.O. cuentan.
- «Reincorporar» devuelve a PENDIENTE los W.O. generados por el retiro.
- No se recalculan los grupos. Se avisa que los grupos quedan desparejos en la práctica.
- Los jugadores del equipo permanecen en la base.

**HU-41: Cierre del torneo y posiciones finales** · Must · Depende de: HU-38

*Como organizador, quiero cerrar el torneo y ver las posiciones finales, para anunciar al campeón y los premios.*

Criterios de aceptación:

- Con todos los partidos FINALIZADOS se ofrece «Cerrar torneo». El estado pasa a FINALIZADO y se genera un respaldo.
- Posiciones finales según formato (sección 2). Empates mostrados como «3° (empatado)» con el criterio de desempate usado. Eliminados en la misma ronda comparten puesto o se ordenan por la tabla de la fase previa, según el formato.
- Se calculan campeón, subcampeón, podio y los 3 mejores goleadores.
- Editar un resultado con el torneo FINALIZADO está permitido. Si deja partidos pendientes, el torneo vuelve a EN\_CURSO.

---

## Épica E5: Pantalla del proyector

**HU-42: Ventana del proyector y sincronización** · Must · Depende de: HU-01, HU-03

*Como organizador, quiero abrir una pantalla pública en el monitor externo que se actualice sola, para que los jugadores vean qué sigue sin que yo explique.*

Criterios de aceptación:

- Botón «Abrir proyector» en el panel abre `/proyector` en una ventana nueva, con instrucciones para arrastrarla al monitor externo y un botón de pantalla completa (la Fullscreen API exige un gesto del usuario en esa ventana).
- El panel publica el estado por `BroadcastChannel` con número de secuencia después de cada cambio. El proyector aplica siempre el más reciente.
- Al abrirse, el proyector lee el estado desde IndexedDB y envía un mensaje de saludo para recibir el estado actual. Si la pestaña estuvo dormida, al volver a ser visible pide resincronización.
- El proyector es solo lectura: nunca escribe en la base.
- Indicador en el panel «Proyector conectado/desconectado» (latido cada 2 segundos).
- Se admiten varias ventanas de proyector a la vez.
- Sin cursor ni scroll. Tipografías escalables con el tamaño de la ventana (1080p y 720p). Tema oscuro.

**HU-43: Vistas del proyector** · Must · Depende de: HU-42, HU-16, HU-19

*Como jugador que espera, quiero ver claramente qué partido se juega y cuál sigue, para saber cuándo me toca.*

Criterios de aceptación:

- Vistas: equipos y fixture (previo al torneo), placa del partido en juego (colores, nombres y marcador en vivo, con el último try y su autor si lo hay), próximo partido (equipos y hora tentativa, o «a definir»), lista corta (últimos 3 finalizados, actual y próximos 5), tablas de posiciones (con el criterio de desempate), cuadro de eliminación, goleadores (top 10), posiciones finales y podio, mensaje y temporizador.
- El texto sobre el color de cada equipo se elige automáticamente por contraste (WCAG).
- Las tablas largas rotan por sub-vistas, por ejemplo un grupo por vez.
- Si una vista no tiene datos (sin goleadores aún), se omite de la rotación en lugar de mostrarse vacía.
- Los nombres largos se truncan con puntos suspensivos sin romper el diseño.

**HU-44: Rotación automática según contexto** · Must · Depende de: HU-43

*Como organizador, quiero que el proyector cambie de vista solo según el momento, para no tener que manejarlo durante el torneo.*

Criterios de aceptación:

- Contexto calculado por una función pura a partir del estado del torneo, el partido EN\_JUEGO y el temporizador. Tiempo por vista configurable (default 12 segundos).

| Contexto | Vista automática |
| --- | --- |
| Antes de empezar | Equipos y fixture |
| Partido «En juego» | Placa con marcador en vivo, alternando con el próximo partido |
| Entre partidos o break | Próximos partidos y tablas, más el temporizador si hay uno corriendo |
| Torneo finalizado | Posiciones finales, ganadores y goleadores |

- Al poner un partido en juego la placa aparece de inmediato.
- Al finalizar un partido se muestra el resultado final 15 segundos y luego se pasa al contexto de break.

**HU-45: Forzado manual de vista** · Must · Depende de: HU-44

*Como organizador, quiero fijar una vista a mano, para mostrar algo puntual como las tablas o los goleadores.*

Criterios de aceptación:

- Desde el panel se elige cualquier vista (con parámetro cuando corresponde: qué copa). La vista de posiciones muestra juntas las tablas independientes de todos los grupos. Queda «Fijada» con un indicador visible y un botón «Volver a automático».
- La vista fijada se guarda en `EstadoProyector` y sobrevive a un refresco.
- Si la vista fijada deja de tener datos, se vuelve al modo automático con un aviso en el panel.

**HU-46: Temporizador** · Must · Depende de: HU-42

*Como organizador, quiero un temporizador visible en el proyector, para marcar el break o el almuerzo.*

Criterios de aceptación:

- Un temporizador a la vez: nombre y duración. Se guarda `finEpochMs`, no los segundos restantes.
- El proyector calcula el tiempo restante contra el reloj cada 250 ms. Sobrevive a refrescos y a reabrir el proyector.
- Acciones: iniciar, sumar o restar 1 minuto, cancelar. Presets editables (Break 10:00, Almuerzo 45:00, Entrega de premios 10:00).
- Al llegar a cero parpadea y emite un sonido opcional. Queda en 00:00 hasta que el organizador lo cierre.
- Se muestra superpuesto en las vistas del contexto de break y en cualquier vista fijada.

**HU-47: Mensaje libre** · Should · Depende de: HU-42

*Como organizador, quiero mostrar un aviso en el proyector, para comunicar cosas como «Almuerzo hasta las 14:00».*

Criterios de aceptación:

- Texto plano de hasta 140 caracteres. Se escapa cualquier HTML.
- Modo banda inferior o pantalla completa. Visible hasta que se borra. Persiste entre refrescos.
- Puede convivir con el temporizador.

---

## Épica E6: Respaldo y recuperación

**HU-48: Copias de seguridad rotativas** · Must · Depende de: HU-03

*Como organizador, quiero copias automáticas del torneo, para volver atrás si algo sale mal.*

Criterios de aceptación:

- Se genera una copia: al iniciar el torneo, al cerrar cada partido, antes de importar, antes de cargar un archivo, antes de una edición con cascada y cada X minutos (default 5, configurable entre 1 y 60, solo si hubo cambios).
- Se conservan las últimas 10 en forma rotativa. La copia de `INICIO_TORNEO` se conserva aparte y no rota.
- Lista con fecha, motivo y resumen (partidos finalizados) y botón «Restaurar». Restaurar crea una copia del estado actual antes y pide confirmación.
- La operación no bloquea la UI.
- Si se agota la cuota de IndexedDB: aviso visible recomendando guardar a archivo.

**HU-49: Guardar torneo a archivo** · Must · Depende de: HU-03

*Como organizador, quiero guardar el torneo en un archivo, para llevarlo a otra computadora o tener un respaldo externo.*

Criterios de aceptación:

- Botón «Guardar torneo» siempre visible. Descarga `torneo-<nombre>-<yyyymmdd-hhmm>.json` con `versionEsquema`, fecha y versión de la app.
- Incluye todo el torneo (jugadores, equipos, fases, grupos, partidos, eventos, sorteos y reglas). No incluye el estado del proyector.
- Incluye un checksum para detectar archivos corruptos.
- Indicador «Último archivo guardado hace X min». Aviso cuando pasaron más de 30 minutos (configurable) con cambios sin guardar.

**HU-50: Cargar torneo desde archivo** · Must · Depende de: HU-49

*Como organizador, quiero cargar un torneo guardado, para continuar en otra computadora o recuperarme de una falla.*

Criterios de aceptación:

- Valida que sea JSON, la estructura, el checksum y la versión. Si la versión es más nueva que la de la app, error claro. Si es más vieja, se migra.
- Muestra un resumen (nombre, fecha, equipos, partidos finalizados) y pide confirmación explícita porque reemplaza el torneo actual.
- Antes de cargar, respaldo automático (`ANTES_DE_CARGAR`).
- Archivo corrupto o incompleto: no se toca nada y se muestra el problema.
- Después de cargar se validan los invariantes de la sección 3.8. Si hay incumplimientos críticos (ids faltantes), no se carga.
- El proyector se resincroniza.

**HU-51: Autoguardado a una carpeta** · Could · Depende de: HU-49

*Como organizador, quiero que se guarde un archivo de respaldo solo, para tener una copia fuera del navegador.*

Criterios de aceptación:

- En Chrome y Edge, con File System Access API: se elige una carpeta una vez y se escribe el archivo cada vez que se genera una copia (HU-48). El permiso se guarda y, si se pierde, se pide con un clic.
- En navegadores sin soporte la opción no aparece y se muestra el recordatorio de guardado manual.
- Un error de escritura nunca bloquea el torneo.

**HU-52: Panel único y recuperación ante cierres** · Must · Depende de: HU-03

*Como organizador, quiero que el sistema evite conflictos entre dos paneles y se recupere de cierres inesperados, para no perder trabajo.*

Criterios de aceptación:

- Web Locks API: si ya hay un panel abierto, el segundo se abre en solo lectura con un mensaje y el botón «Tomar control» (el otro queda en solo lectura).
- Al abrir, si la sesión anterior no cerró limpia, se informa «cierre inesperado, último guardado hh:mm:ss» y se ofrece revisar las copias.
- Si un guardado en IndexedDB falla, banner rojo persistente «Hay cambios sin guardar» con el botón de guardar archivo.

---

## Épica E7: Formatos avanzados (suizo y doble eliminación)

**HU-53: Suizo, generación de rondas** · Must · Depende de: HU-22, HU-28

*Como organizador, quiero que el sistema empareje cada ronda por puntaje sin repetir rivales, para jugar un suizo correcto.*

Criterios de aceptación:

- Al generar el fixture se crea la ronda 1 (sorteo guardado, o mitad superior contra mitad inferior si hay cabezas de serie).
- La ronda k+1 se habilita cuando todos los partidos de la ronda k están FINALIZADOS. Se muestra una vista previa de emparejamientos con la explicación de por qué se emparejó así, para aprobar o regenerar.
- Emparejamiento: se agrupa por puntos de tabla (con desempates), dentro de cada grupo se empareja mitad alta con mitad baja, nunca se repite rival, se usa backtracking y un equipo sin pareja baja al siguiente grupo de puntaje.
- Si no existe emparejamiento sin repetir, se informa y se ofrece la mejor alternativa con el mínimo de repeticiones, marcada como «repetición», que requiere confirmación.
- Los equipos retirados no se emparejan.
- Tests: n = 7, 8, 9, 16 con 3 o 4 rondas.

**HU-54: Suizo, byes, edición y tabla** · Must · Depende de: HU-53, HU-38

*Como organizador, quiero que el suizo maneje cantidades impares y correcciones, para no trabarme en mitad del torneo.*

Criterios de aceptación:

- Bye con n impar: lo recibe el equipo de menor puntaje que todavía no lo tuvo. Cuenta según la configuración (default: victoria en puntos de tabla, sin PF ni PC). Se muestra «Libre (bye)».
- Editar un resultado de la ronda k con rondas posteriores generadas: se regeneran los emparejamientos de la ronda k+1 con la tabla nueva. Si son iguales no hay avisos. Si cambian, se aplica HU-38 (lista de afectados, confirmación y reseteo de las rondas posteriores).
- Buchholz disponible como criterio de desempate.
- Posiciones finales: tabla única con desempates y su explicación.
- El proyector muestra la tabla y los emparejamientos de la ronda actual.

**HU-55: Doble eliminación, generación de llaves** · Must · Depende de: HU-24

*Como organizador, quiero una llave de ganadores y una de perdedores generadas solas, para que nadie quede eliminado con una sola derrota.*

Criterios de aceptación:

- Llave de ganadores: eliminación directa de tamaño P (HU-24).
- Llave de perdedores con referencias `PERDEDOR(partidoId)` y `GANADOR(partidoId)`: los perdedores de la ronda 1 de ganadores juegan entre sí. Después se alternan rondas de «caída» (perdedores de ganadores contra ganadores de perdedores) y rondas internas.
- En las rondas de caída se invierte el orden de cruce para evitar revanchas inmediatas.
- Final: campeón de ganadores contra campeón de perdedores. Con el parámetro «final con reinicio», existe un partido de reinicio condicional.
- El total de partidos coincide con `2n−2` (o `2n−1` si se juega el reinicio). Tests con n = 4 (6 partidos) y n = 8 (14 partidos).

**HU-56: Doble eliminación, avance, final y reinicio** · Must · Depende de: HU-55, HU-28

*Como organizador, quiero que el avance de ambas llaves y la final funcionen solos, para solo cargar resultados.*

Criterios de aceptación:

- Un equipo queda eliminado al acumular 2 derrotas (derivado, incluye W.O. y muerte súbita). La vista de llave muestra las «vidas» de cada equipo (2 o 1).
- Los empates no se pueden cerrar en toda la estructura (HU-36).
- Final: si gana el campeón de ganadores, el torneo termina y el partido de reinicio queda «No necesario» (no cuenta como pendiente ni bloquea el cierre). Si gana el campeón de perdedores y hay reinicio, el reinicio se habilita.
- Con el parámetro de reinicio en «no», la final es definitiva.
- La edición con cascada (HU-38) sigue las dependencias `GANADOR` y `PERDEDOR` de forma transitiva.

**HU-57: Doble eliminación con byes** · Must · Depende de: HU-56

*Como organizador, quiero usar doble eliminación con cualquier cantidad de equipos, para no depender de potencias de 2.*

Criterios de aceptación:

- Con n que no es potencia de 2, la llave es de tamaño P y los byes de la ronda 1 de ganadores van a los mejores sembrados.
- Los partidos de perdedores donde falta un participante por bye se resuelven solos («fantasmas»): no se muestran, no cuentan y el equipo avanza automáticamente.
- El total de partidos reales es `2n−2` (o `2n−1`). Tests con n = 5, 6, 7, 9 y 12.
- Posiciones finales según 2.7. El cronograma ignora los fantasmas.
- La UI explica los byes: «Con 6 equipos hay 2 byes, los reciben los equipos sembrados 1 y 2».

---

## Épica E8: Transversales

**HU-58: Ayudas y explicaciones** · Must · Depende de: HU-02

*Como organizador, quiero que el sistema me explique las decisiones raras, para poder justificarlas ante los equipos.*

Criterios de aceptación:

- Componente reutilizable de explicación (ícono ⓘ o enlace «¿Por qué?») para: descripción de cada formato y parámetro, grupos desparejos (regla y partidos descartados), siembra y byes, desempate usado, sorteos, muerte súbita, W.O., cascada de edición y «tries a favor incompleto».
- Los textos viven en un único archivo de recursos en español rioplatense, no dentro de los componentes.
- Cuando corresponde, la explicación incluye los datos reales. Ejemplo: «A y B empataron en 7 puntos. Desempate por diferencia: A +12, B +5».
- Panel «Cómo funciona este formato» accesible desde la vista del fixture.

**HU-59: Nuevo torneo y reinicio** · Must · Depende de: HU-48

*Como organizador, quiero empezar un torneo nuevo o reiniciar el fixture, para reutilizar la app o rehacer la estructura.*

Criterios de aceptación:

- «Nuevo torneo»: borra todo con una confirmación fuerte (escribir «BORRAR»), respaldo previo y recordatorio de guardar archivo.
- «Reiniciar fixture» (con torneo EN\_CURSO): borra partidos, eventos y sorteos de grupos. Conserva jugadores y equipos, reactiva equipos retirados y vuelve a CONFIGURACION. Doble confirmación y respaldo.
- Ambas acciones indican exactamente qué se borra.

**HU-60: Funcionamiento offline y actualizaciones** · Should · Depende de: HU-01

*Como organizador, quiero estar seguro de que la app funciona sin internet y no se actualiza sola en pleno torneo, para evitar sorpresas.*

Criterios de aceptación:

- Indicadores de conectividad y de «Listo para usar sin conexión».
- Si hay versión nueva: aviso discreto. Con el torneo EN\_CURSO no se recarga jamás de forma automática. Botón «Actualizar ahora» con recordatorio de guardar.
- Versión de la app visible en el pie y registrada en los archivos guardados.
- Si falla el service worker, la app sigue con la versión cargada.

**HU-61: Usabilidad de la mesa de control** · Should · Depende de: HU-34

*Como organizador que opera bajo presión, quiero una interfaz rápida y clara, para cargar eventos sin errores.*

Criterios de aceptación:

- Botones de al menos 44 px, usables con touch.
- Atajos de teclado configurables para try y conversión de cada equipo y para deshacer el último evento.
- Confirmaciones solo en acciones destructivas. Se prefiere deshacer cuando es posible.
- Panel con tema claro y oscuro. Diseño usable en laptops de 13 pulgadas.
- Mensajes de error en lenguaje claro, sin códigos técnicos.

---

## 5. Decisiones a validar, riesgos y alcance

### 5.1 Decisiones de diseño pendientes de validar

- **Cruces de posiciones con 3 o más grupos (HU-27):** niveles con mini-liga o eliminación según tamaño. Validar al implementar.
- **Bonus del 4-2-0:** definido como +1 por 4 o más tries y +1 por perder por 7 puntos o menos, ambos configurables. Confirmar con tu reglamento.
- **Bye del suizo:** cuenta como victoria en tabla sin PF ni PC por defecto. Es configurable.
- **Doble eliminación:** sin partido por el 3er puesto (el 3° sale de la llave de perdedores).
- **Categorías:** el catálogo viene con Escuelita, M7 a M19 (incluida M18), Plantel Superior y Veteranos, y es ampliable. Si más adelante querés distinguir Primera, Intermedia o Preintermedia dentro del Plantel Superior, se agregan al catálogo sin tocar el modelo.

### 5.2 Riesgos técnicos

- **Datos en el navegador:** si alguien limpia los datos del sitio se pierden. Mitigación: HU-48, HU-49 y HU-51, más el hábito de guardar archivo.
- **Safari y Firefox:** Safari puede borrar datos de sitios sin uso tras 7 días. Para un torneo de un día no es problema, pero no se recomienda para guardar torneos a largo plazo.
- **Popups bloqueados:** el proyector puede no abrir. Mitigación en HU-01 y HU-42.
- **Detección de codificación de CSV:** es heurística. Mitigación: vista previa y forzado manual (HU-08).
- **Módulo más riesgoso:** doble eliminación con byes y cascada de edición (HU-55 a HU-57). Por eso va en el Hito 6, con tests exhaustivos, y el resto del producto no depende de él.

### 5.3 Definición de «listo» para cada HU

1. Reglas de dominio implementadas en `domain/` con tests unitarios que cubren los casos borde de los criterios.
2. Sin imports de Angular ni del navegador en `domain/`.
3. Funciona sin conexión y sobrevive a un refresco de página.
4. Las decisiones no obvias muestran su explicación (HU-58).
5. Toda operación que modifica datos es atómica y recuperable desde una copia.

### 5.4 Fuera del alcance del MVP

Exportables y reportes, historial de torneos, usuarios y seguridad, varias competencias en simultáneo, más de una cancha, logos de equipos (el campo existe, sin pantalla), penales, drops y tarjetas, varios temporizadores, doble W.O., sincronización con otros dispositivos.

---

## 6. Mapa de pantallas y navegación

Este mapa define qué pantallas existen, cómo se navega entre ellas y qué muestra cada una. Los textos de la interfaz van en español. Cada pantalla indica las historias que la implementan.

### 6.1 Principios de navegación

- **Dos ventanas:** el panel (`/#/panel/...`) es donde se opera. El proyector (`/#/proyector`) es la pantalla pública, de solo lectura.
- **Panel con barra superior y menú lateral.** El menú agrupa las pantallas por momento del torneo y deshabilita (con una explicación al pasar el mouse) lo que todavía no corresponde.
- **La pantalla inicial depende de la fase del torneo:** sin torneo, bienvenida. En preparación, el resumen con checklist. Con el torneo en curso, la mesa de control.
- **Una acción principal por pantalla.** Las acciones destructivas siempre pasan por confirmación. Donde se pueda se prefiere «Deshacer».
- **Diseño para laptop de 13 pulgadas**, con controles grandes (mínimo 44 px) en la mesa de control.

### 6.2 Estructura de rutas

| Ruta | Pantalla | HU |
| --- | --- | --- |
| `/#/` | Redirige a bienvenida o al panel según haya torneo | HU-03 |
| `/#/bienvenida` | Bienvenida | HU-03, HU-50, HU-59 |
| `/#/panel/inicio` | Resumen y checklist | HU-31 |
| `/#/panel/jugadores` | Lista de jugadores | HU-04, HU-07 |
| `/#/panel/jugadores/importar` | Asistente de importación (4 pasos) | HU-08 a HU-11 |
| `/#/panel/equipos` | Lista de equipos | HU-05 |
| `/#/panel/equipos/armar` | Armado de equipos (asignación, sorteo, capacidad) | HU-06, HU-12, HU-13 |
| `/#/panel/equipos/:id` | Detalle de un equipo | HU-05, HU-06, HU-40 |
| `/#/panel/reglas` | Reglas del torneo | HU-14 |
| `/#/panel/formato` | Asistente de formato y grupos | HU-20 a HU-22 |
| `/#/panel/fixture` | Fixture y cronograma | HU-29 a HU-31 |
| `/#/panel/mesa` | Mesa de control | HU-32 a HU-37, HU-39 |
| `/#/panel/partidos/:id` | Detalle y edición de un partido | HU-34 a HU-38 |
| `/#/panel/posiciones` | Tablas, comparativa y cuadro | HU-16 a HU-18, HU-41 |
| `/#/panel/goleadores` | Goleadores | HU-19 |
| `/#/panel/proyector` | Control del proyector | HU-42 a HU-47 |
| `/#/panel/respaldo` | Copias, guardar y cargar | HU-48 a HU-52 |
| `/#/panel/ajustes` | Ajustes del sistema | HU-59, HU-60 |
| `/#/proyector` | Pantalla pública | HU-42 a HU-47 |

### 6.3 Menú lateral del panel

| Grupo | Entradas | Disponibilidad |
| --- | --- | --- |
| Preparación | Jugadores, Equipos, Reglas, Formato, Fixture | Siempre visibles. Con el torneo en curso, Formato queda bloqueado (HU-32). |
| Torneo | Mesa de control, Posiciones, Goleadores | Mesa y Posiciones se habilitan con el fixture generado. |
| Pantalla pública | Control del proyector | Siempre |
| Sistema | Respaldo, Ajustes | Siempre |

### 6.4 Elementos globales del panel

- **Barra superior:** nombre del torneo, estado (Preparación, En curso, Finalizado), indicador «Guardado hh:mm:ss» (HU-03), indicador «Proyector conectado» (HU-42), botón «Guardar torneo» (HU-49) y botón «Abrir proyector».
- **Banners persistentes (uno a la vez, por prioridad):** hay cambios sin guardar (HU-52), este panel está en solo lectura porque hay otro abierto (HU-52), hay una versión nueva de la app (HU-60), sin conexión (HU-60).
- **Diálogos reutilizables:** confirmación genérica, aviso de homónimo (HU-07), lista de partidos afectados por una edición (HU-38), muerte súbita (HU-36), W.O. (HU-37), retirar equipo (HU-40), «¿Por qué?» con explicaciones (HU-58).
- **Atajos de teclado** en la mesa de control (HU-61).

### 6.5 Pantallas del panel

**Bienvenida** (`/#/bienvenida`)

- Tres acciones grandes: «Nuevo torneo», «Cargar torneo desde archivo» y, si existen, «Restaurar una copia automática».
- Al crear un torneo se pide solo el nombre y la fecha. El resto se configura después.
- Si se detectó un cierre inesperado (HU-52), se muestra el aviso con la última hora guardada.

**Resumen y checklist** (`/panel/inicio`)

- En preparación: checklist con cuatro pasos y su estado: jugadores cargados, equipos armados, formato elegido, fixture generado. Cada paso lleva a su pantalla. Muestra las advertencias pendientes (equipos bajo el mínimo, jugadores sueltos).
- Con fixture generado y torneo sin iniciar: botón «Ir a la mesa de control».
- Con el torneo finalizado: campeón, podio y accesos a posiciones y goleadores.

**Jugadores** (`/panel/jugadores`)

- Tabla con búsqueda y filtros (equipo, sueltos, categoría, género) y contador total.
- Botones «Agregar jugador» (diálogo con nombre, apellido, categoría, género, equipo) e «Importar planilla».
- Edición y borrado desde cada fila. Los homónimos se muestran con su aclaración.

**Importar planilla** (`/panel/jugadores/importar`), asistente de 4 pasos

1. **Archivo:** arrastrar o elegir CSV o Excel. Vista de las primeras filas, con selector de codificación y delimitador si hay caracteres rotos. Enlace «Descargar plantilla».
2. **Columnas:** mapeo de cada campo a una columna de la planilla, con sugerencias automáticas.
3. **Revisión:** tabla de filas con estado OK, Advertencia o Error, valor original junto al normalizado, edición de celdas, descarte de filas, contadores y filtro por estado.
4. **Confirmación:** resumen (creados, omitidos, equipos nuevos, equipos bajo el mínimo), unificación de nombres de equipo parecidos y botón «Importar».

**Equipos** (`/panel/equipos`)

- Tarjetas con nombre, dos colores, capitán, cantidad de jugadores con semáforo (rojo bajo el mínimo, amarillo sobre el máximo) y marca de cabeza de serie.
- Acciones: «Nuevo equipo», «Armar equipos» (lleva a la pantalla siguiente).

**Armar equipos** (`/panel/equipos/armar`)

- Panel izquierdo: jugadores sueltos con filtros. Panel derecho: el equipo seleccionado. Se mueve con multiselección.
- Panel lateral «Capacidad»: cuántos equipos son posibles según jugadores y límites de plantel, con el reparto de cada opción (HU-13).
- Botón «Sortear sueltos»: abre el diálogo con la cantidad de equipos, la opción de balancear por categoría y género, y la vista previa para confirmar o repetir.

**Detalle de equipo** (`/panel/equipos/:id`)

- Edición de nombre, colores (con vista previa de legibilidad), capitán y cabeza de serie.
- Lista del plantel con la posibilidad de mover o quitar jugadores.
- Con el torneo en curso: botón «Retirar equipo» o «Reincorporar».
- Partidos del equipo y su resultado.

**Reglas del torneo** (`/panel/reglas`)

- Formulario agrupado: datos generales, puntos de tabla (con presets 3-2-1 y 4-2-0), bonus, orden de desempates (lista reordenable), marcador de W.O., tratamiento del bye, mínimo y máximo de jugadores, duración, descanso y hora de inicio.
- Con el torneo en curso, un cambio que afecte posiciones muestra el aviso de recálculo (HU-14).

**Formato** (`/panel/formato`), asistente por pasos

1. **Equipos:** cantidad actual (editable para simular).
2. **Elegir formato:** una tarjeta por formato con descripción, total de partidos, mínimo por equipo, duración estimada y advertencias. Formatos no viables, deshabilitados con el motivo. Comparación de hasta 3.
3. **Parámetros:** campos del formato elegido con recálculo en vivo y ayudas.
4. **Grupos y sorteo** (si el formato usa grupos o siembra): cabezas de serie, sorteo, repetir, ajuste manual y explicación.
5. **Generar fixture:** resumen final y botón «Generar fixture».

- Con el torneo en curso la pantalla es de solo consulta.

**Fixture** (`/panel/fixture`)

- Vista por fase y ronda con hora tentativa, estado, resultado y cruces «a definir».
- Reordenar partidos pendientes (arrastrar o subir y bajar), insertar pausas programadas, restablecer el orden sugerido.
- Resumen superior: partidos totales, mínimo por equipo, duración estimada, equipos con descanso corto.
- Botón «Regenerar fixture» (solo antes de iniciar).
- Botón «Cómo funciona este formato» (HU-58).

**Mesa de control** (`/panel/mesa`), la pantalla más importante

- Bloque **En juego** (si hay): equipos con colores, marcador en vivo, botones grandes «Try» y «Conversión» por equipo, selector de jugador con búsqueda y «Sin autor», lista de eventos con deshacer, botones «Finalizar partido», «Volver a pendiente», «Marcador directo».
- Bloque **Próximo partido:** equipos, hora tentativa y botón «Poner en juego». Si no es jugable, explica por qué y propone el siguiente.
- Bloque **Siguientes:** lista corta de pendientes con hora tentativa y acción «W.O.».
- Bloque lateral **Últimos resultados** con acceso a editar cada uno.
- Al finalizar un partido empatado en eliminación, se abre el diálogo de muerte súbita.

```
+-----------------------------------------------------------+
| EN JUEGO · Semifinal 1                                    |
|  [Equipo A]  14   -   7  [Equipo B]                       |
|  [ TRY ] [ CONVERSIÓN ]     [ TRY ] [ CONVERSIÓN ]        |
|  Jugador: [buscar...] [Sin autor]                         |
|  Eventos: Try Pérez · Conv. Pérez · Try Gómez   [Deshacer]|
|  [Finalizar partido] [Marcador directo] [Volver a pend.]  |
+------------------------------+----------------------------+
| PRÓXIMO · 15:20              | ÚLTIMOS RESULTADOS         |
| C vs D   [Poner en juego]    | A 21 - 12 C   [Editar]     |
| SIGUIENTES                   | B 5 - 28 D    [Editar]     |
| 15:45 E vs F   [W.O.]        |                            |
+------------------------------+----------------------------+
```

**Detalle y edición de partido** (`/panel/partidos/:id`)

- Datos del partido, estado, hora real, eventos, marcador y modo de resultado.
- Edición de eventos y de marcador. Al guardar, si cambia algún clasificado, se abre el diálogo de partidos afectados (HU-38).
- Acciones según estado: finalizar, W.O., deshacer W.O., volver a pendiente.

**Posiciones** (`/panel/posiciones`)

- Pestañas según el formato: Tablas de grupos, Tabla comparativa (grupos desparejos), Cuadro de eliminación o llaves, Tabla suiza.
- Cada fila de empate muestra el criterio usado con un ícono «¿Por qué?».
- Con el torneo finalizado, pestaña adicional «Posiciones finales».
- En el suizo, botón «Generar ronda siguiente» con vista previa de emparejamientos (HU-53).
- Botón «Cerrar torneo» cuando todos los partidos terminaron (HU-41).

**Goleadores** (`/panel/goleadores`)

- Pestañas de puntos, tries y conversiones. Filtros por categoría y género. Nota con la cantidad de tries sin autor.

**Control del proyector** (`/panel/proyector`)

- Estado de conexión y botón «Abrir proyector» con instrucciones para el segundo monitor.
- Selector de vista: «Automática» o fijar una vista concreta (con parámetro cuando corresponde). La vista fijada se marca claramente.
- Temporizador: nombre, duración, presets, +1 min, -1 min y cancelar.
- Mensaje libre: texto, modo (banda o pantalla completa) y borrar.
- Miniatura de lo que está mostrando el proyector.

**Respaldo** (`/panel/respaldo`)

- Botón «Guardar torneo» y «Cargar torneo desde archivo» con el resumen previo.
- Lista de copias automáticas con fecha, motivo y resumen, y «Restaurar».
- Opción de carpeta de autoguardado (solo en Chrome y Edge) y configuración del intervalo.
- Hora del último archivo guardado.

**Ajustes** (`/panel/ajustes`)

- Catálogo de categorías (agregar o quitar).
- «Reiniciar fixture» y «Nuevo torneo», en una zona separada y marcada como peligrosa, con las confirmaciones de HU-59.
- Versión de la app, estado offline y buscar actualización (HU-60).

### 6.6 Pantalla pública (`/#/proyector`)

Ventana única, siempre oscura, sin menús, cursor ni scroll. Un botón discreto (visible al mover el mouse) activa la pantalla completa. Todas las vistas respetan la rotación y el forzado de HU-44 y HU-45.

| Vista | Contenido | Cuándo aparece |
| --- | --- | --- |
| Equipos y fixture | Equipos con colores y lista de partidos | Antes de empezar |
| Placa de partido | Equipos con colores, marcador en vivo, último try y su autor | Partido en juego |
| Próximo partido | Equipos, hora tentativa o «a definir» | Alterna con la placa y en los breaks |
| Lista corta | Últimos 3 finalizados, actual y próximos 5 | Entre partidos |
| Tablas | Todas las tablas de grupo juntas, cada una con su criterio de desempate | Entre partidos |
| Cuadro | Llave de eliminación con los cruces | Entre partidos, en fases finales |
| Goleadores | Top 10 | Entre partidos, si hay datos |
| Resultado final | Marcador final del partido recién terminado, 15 segundos | Al finalizar un partido |
| Posiciones finales | Podio, campeón y goleadores | Torneo finalizado |
| Mensaje | Banda inferior o pantalla completa | Cuando se carga un mensaje |
| Temporizador | Nombre y cuenta regresiva, superpuesto | Cuando hay uno activo |

```
+-----------------------------------------------------------+
|                    SEMIFINAL 1  ·  15:20                  |
|                                                           |
|   +------------------+            +------------------+    |
|   |   EQUIPO A       |    14 - 7  |   EQUIPO B       |    |
|   | (color primario) |            | (color primario) |    |
|   +------------------+            +------------------+    |
|            Último try: Pérez (A)                          |
|                                                           |
|  Próximo: C vs D · 15:45          [Break 07:42]           |
+-----------------------------------------------------------+
```

### 6.7 Comportamiento por fase del torneo

| Pantalla | Preparación | Fixture generado | En curso | Finalizado |
| --- | --- | --- | --- | --- |
| Jugadores y equipos | Editable | Editable (equipos: sin alta ni baja desde el inicio) | Jugadores, capitanes y colores editables | Editable |
| Reglas | Editable | Editable | Editable con aviso de recálculo | Editable con aviso |
| Formato | Editable | Editable (regenerar es gratis) | Solo consulta | Solo consulta |
| Fixture | Vacío | Reordenable | Reordenable (pendientes) | Solo consulta |
| Mesa de control | Bloqueada | Habilitada (iniciar con el primer partido) | Operativa | Solo consulta, edición de resultados permitida |
| Posiciones y goleadores | Vacías | Vacías | Con datos | Con datos y posiciones finales |
| Proyector | Equipos y fixture | Equipos y fixture | Automático por contexto | Posiciones finales |
