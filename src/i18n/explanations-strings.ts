import type { FormatId, FormatParams, Tiebreaker } from '../domain/model';

export const EXPLANATION_STRINGS = {
  why: '¿Por qué?',
  howFormat: 'Cómo funciona este formato',
  noFormat: 'Todavía no hay un formato guardado.',
  formatSummary: (description: string, params: string) =>
    `${description} Parámetros configurados: ${params}.`,
  formatParameters: (params: FormatParams) => {
    if (params.format === 'ROUND_ROBIN') return `Vueltas: ${params.rounds}`;
    if (params.format === 'SWISS') return `Rondas: ${params.rounds}`;
    if (params.format === 'DOUBLE_ELIMINATION')
      return `Final con reinicio: ${params.grandFinalReset ? 'sí' : 'no'}`;
    if (params.format === 'GROUPS_KNOCKOUT') {
      return `Grupos: ${params.groupCount}; clasificados por grupo: ${params.qualifiersPerGroup}; 3er puesto: ${params.thirdPlaceMatch ? 'sí' : 'no'}`;
    }
    if (params.format === 'GROUPS_CUPS') {
      return `Grupos: ${params.groupCount}; 3er puesto de cada copa: ${params.thirdPlaceMatch ? 'sí' : 'no'}`;
    }
    if (params.format === 'GROUPS_POSITION_PLAYOFFS') return `Grupos: ${params.groupCount}`;
    return `3er puesto: ${params.thirdPlaceMatch ? 'sí' : 'no'}`;
  },
  formatDescriptions: {
    ROUND_ROBIN: 'Todos juegan contra todos. Gana quien más puntos suma.',
    GROUPS_KNOCKOUT: 'Los equipos juegan en grupos y los mejores pasan a una llave de eliminación.',
    GROUPS_CUPS: 'Después de los grupos, cada posición disputa una copa hasta el final.',
    KNOCKOUT: 'Llave de eliminación desde el primer partido.',
    GROUPS_POSITION_PLAYOFFS: 'Los equipos juegan grupos y luego cruces según su posición.',
    SWISS: 'En cada ronda se enfrentan equipos con rendimiento parecido sin repetir rivales.',
    DOUBLE_ELIMINATION: 'Cada equipo queda eliminado recién cuando pierde dos veces.',
  } satisfies Readonly<Record<FormatId, string>>,
  parameters: {
    rounds: 'Cada equipo juega contra cada rival la cantidad de vueltas elegida.',
    swissRounds:
      'Se juega la cantidad de rondas definida, entre 1 y la cantidad de equipos menos 1.',
    groupCount: 'Los equipos se reparten entre la cantidad de grupos elegida.',
    qualifiers: 'Avanza la cantidad de equipos indicada desde cada grupo.',
    thirdPlace: 'Si está habilitado, se agrega un partido para definir el tercer puesto.',
    grandFinalReset:
      'Si el equipo que viene por la llave de perdedores gana la final, se disputa una segunda final.',
  },
  unevenGroups:
    'Para comparar equipos de grupos de distinto tamaño, se descartan sus partidos contra el último equipo de los grupos más grandes. La comparación puede ser provisoria hasta que terminen esos partidos.',
  unevenGroupsMatches: (matches: string, provisional: boolean) =>
    matches.length === 0
      ? 'Todavía no hay partidos de grupos para mostrar como descartados.'
      : `${provisional ? 'De manera provisoria, ' : ''}se descartan estos partidos: ${matches}.`,
  groupUnevenSizes: (sizes: readonly number[]) =>
    `Reparto de grupos: ${sizes.map((size, index) => `Grupo ${String.fromCharCode(65 + index)}: ${size}`).join(', ')}.`,
  groupDraw:
    'El sorteo guarda su semilla para que los grupos no cambien al volver a abrir o recalcular el fixture.',
  teamDraw:
    'El sorteo guarda su semilla y las asignaciones confirmadas para que los equipos no cambien al volver a abrir la app.',
  teamDrawAssignments: (assignments: string) => `Asignaciones del sorteo: ${assignments}.`,
  seeds: (teams: string) =>
    teams.length > 0
      ? `Las cabezas de serie se distribuyeron primero: ${teams}.`
      : 'No hay cabezas de serie en este sorteo.',
  byes: (count: number) =>
    `La llave necesita ${count} bye${count === 1 ? '' : 's'} para completar sus cruces; los reciben los equipos mejor sembrados.`,
  tiebreak: {
    why: (points: number, criterion: string) =>
      `Los equipos empataron en ${points} puntos. Se aplicó el desempate por ${criterion}.`,
    values: (teams: string) => `Valores comparados: ${teams}.`,
    draw: (teams: string) => `El sorteo registrado ordenó a estos equipos: ${teams}.`,
    criterionLabels: {
      HEAD_TO_HEAD: 'resultado entre los equipos empatados',
      POINT_DIFFERENCE: 'diferencia de puntos',
      POINTS_FOR: 'puntos a favor',
      TRIES_FOR: 'tries a favor',
      BUCHHOLZ: 'Buchholz',
      DRAW: 'sorteo',
    } satisfies Readonly<Record<Tiebreaker, string>>,
  },
  suddenDeath: (winner: string, homePoints: number, awayPoints: number) =>
    `El marcador quedó empatado ${homePoints} - ${awayPoints} en una fase de eliminación. La muerte súbita definió que avanzara ${winner} sin alterar esos puntos.`,
  suddenDeathPending: (homePoints: number, awayPoints: number) =>
    `El marcador está empatado ${homePoints} - ${awayPoints}. Elegí qué equipo avanza por muerte súbita; el resultado conserva esos puntos.`,
  walkoverRule:
    'El W.O. aplica el marcador configurado al equipo ausente. El equipo ganador se determina según las reglas del torneo.',
  walkover: (winner: string, absentTeam: string, winnerPoints: number, loserPoints: number) =>
    `${absentTeam} no se presentó; ${winner} recibió el marcador de W.O. configurado (${winnerPoints} - ${loserPoints}).`,
  cascade:
    'Cambiar este resultado modifica cruces que dependen de él. Los partidos afectados vuelven a pendiente para evitar conservar resultados incompatibles.',
  triesIncompleteWarning: (count: number) =>
    `Tries a favor incompleto: ${count} ${count === 1 ? 'partido sin detalle' : 'partidos sin detalle'}.`,
  triesIncomplete:
    'Los partidos cargados con marcador directo no guardan el detalle de tries. Por eso el total de tries a favor no está completo y no sirve como desempate confiable.',
  fixtureBye: (team: string) =>
    `${team} recibió un bye: avanza sin jugar esta ronda. Los byes se asignan a los equipos mejor sembrados.`,
} as const;
