import { FormatId } from '../domain/model';

interface FormatStrings {
  readonly [key: string]: unknown;
  readonly title: string;
  readonly back: string;
  readonly teamCount: string;
  readonly matchDuration: string;
  readonly restDuration: string;
  readonly minutes: string;
  readonly hours: string;
  readonly compare: string;
  readonly selected: string;
  readonly select: string;
  readonly save: string;
  readonly saved: string;
  readonly saveFailed: string;
  readonly formatLocked: string;
  readonly fixtureResetConfirmation: string;
  readonly fixtureReset: string;
  readonly totalMatches: string;
  readonly minMatchesPerTeam: string;
  readonly maxMatchesPerTeam: string;
  readonly estimatedDuration: string;
  readonly warnings: string;
  readonly notViable: string;
  readonly params: string;
  readonly parameters: string;
  readonly rounds: string;
  readonly roundsDescription: string;
  readonly swissRoundsDescription: string;
  readonly groupCount: string;
  readonly groupCountDescription: string;
  readonly groupDistribution: string;
  readonly unevenGroupsRule: string;
  readonly qualifiersPerGroup: string;
  readonly qualifiersDescription: string;
  readonly thirdPlaceMatch: string;
  readonly thirdPlaceDescription: string;
  readonly grandFinalReset: string;
  readonly grandFinalResetDescription: string;
  readonly groupDrawTitle: string;
  readonly groupDrawDescription: string;
  readonly groupDrawButton: string;
  readonly groupDrawRepeat: string;
  readonly groupDrawConfirm: string;
  readonly groupDrawDisabled: string;
  readonly groupDrawInvalid: string;
  readonly groupDrawFailed: string;
  readonly groupDrawSaved: string;
  readonly groupSeedExplanation: string;
  readonly groupNoSeeds: string;
  readonly groupUnevenExplanation: string;
  readonly groupMoveTitle: string;
  readonly groupMoveTeam: string;
  readonly groupMoveFrom: string;
  readonly groupMoveTo: string;
  readonly groupMoveSwap: string;
  readonly groupMoveButton: string;
  readonly groupMoveInvalid: string;
  readonly groupDrawCurrent: string;
  readonly descriptions: Readonly<Record<FormatId, string>>;
  readonly labels: Readonly<Record<FormatId, string>>;
}

export const FORMAT_STRINGS: FormatStrings = {
  title: 'Asistente de formato',
  back: 'Volver',
  teamCount: 'Cantidad de equipos',
  matchDuration: 'Duración de cada partido (minutos)',
  restDuration: 'Descanso entre partidos (minutos)',
  minutes: 'min',
  hours: 'h',
  compare: 'Comparar',
  selected: 'Seleccionado',
  select: 'Elegir formato',
  save: 'Guardar formato',
  saved: 'Formato, duración y descanso guardados.',
  saveFailed: 'No se pudo guardar el formato. Revisá el almacenamiento del navegador.',
  formatLocked:
    'El torneo está en curso o finalizado. Para cambiar el formato, primero hay que reiniciarlo.',
  fixtureResetConfirmation:
    'Cambiar el formato va a borrar el fixture y los sorteos asociados. Se conservarán los equipos y jugadores. ¿Querés continuar?',
  fixtureReset: 'Formato actualizado. Generá un fixture nuevo para continuar.',
  totalMatches: 'Partidos totales',
  minMatchesPerTeam: 'Partidos mínimos por equipo',
  maxMatchesPerTeam: 'Partidos máximos por equipo',
  estimatedDuration: 'Duración estimada',
  warnings: 'Advertencias',
  notViable: 'No disponible',
  params: 'Parámetros sugeridos',
  parameters: 'Parámetros del formato',
  rounds: 'Vueltas',
  roundsDescription: 'Cantidad de veces que cada equipo juega contra cada rival.',
  swissRoundsDescription:
    'Entre 1 y n-1 rondas. Recomendá al menos log₂(n) para definir un campeón con claridad.',
  groupCount: 'Cantidad de grupos',
  groupCountDescription:
    'Elegí el reparto. Los equipos se distribuyen de manera 4-4-3 o 6-5, según corresponda.',
  groupDistribution: 'Equipos por grupo',
  unevenGroupsRule:
    'Los grupos quedan desparejos; al comparar posiciones, se descartan los partidos contra el último equipo de los grupos más grandes.',
  qualifiersPerGroup: 'Clasificados por grupo',
  qualifiersDescription: 'No puede superar el tamaño del grupo más chico.',
  thirdPlaceMatch: 'Partido por el tercer puesto',
  thirdPlaceDescription: 'Agrega una definición de tercer puesto al formato.',
  grandFinalReset: 'Final con reinicio',
  grandFinalResetDescription: 'Si gana el campeón de perdedores, se juega una segunda final.',
  groupDrawTitle: 'Sorteo de grupos',
  groupDrawDescription:
    'Las cabezas de serie se reparten por tandas y el resto de los equipos se sortea respetando el tamaño de cada grupo.',
  groupDrawButton: 'Sortear grupos',
  groupDrawRepeat: 'Repetir sorteo',
  groupDrawConfirm: 'Confirmar grupos',
  groupDrawDisabled: 'El sorteo solo está disponible antes de iniciar el torneo.',
  groupDrawInvalid: 'No se puede sortear con la configuración actual.',
  groupDrawFailed: 'No se pudo guardar el sorteo de grupos.',
  groupDrawSaved: 'Sorteo de grupos guardado.',
  groupSeedExplanation: 'Cabezas de serie',
  groupNoSeeds: 'ninguna',
  groupUnevenExplanation: 'Grupos desparejos: {groups}.',
  groupMoveTitle: 'Ajuste manual',
  groupMoveTeam: 'Equipo',
  groupMoveFrom: 'Desde',
  groupMoveTo: 'Hacia',
  groupMoveSwap: 'Equipo que intercambia lugar',
  groupMoveButton: 'Mover equipo',
  groupMoveInvalid: 'Elegí un equipo de cada grupo para intercambiar sus lugares.',
  groupDrawCurrent: 'Grupos confirmados',
  ROUND_ROBIN: 'Todos contra todos',
  GROUPS_KNOCKOUT: 'Grupos + eliminación directa',
  GROUPS_CUPS: 'Grupos + copas',
  KNOCKOUT: 'Eliminación directa simple',
  GROUPS_POSITION_PLAYOFFS: 'Grupos + cruces de posiciones',
  SWISS: 'Suizo',
  DOUBLE_ELIMINATION: 'Doble eliminación',
  labels: {
    ROUND_ROBIN: 'Todos contra todos',
    GROUPS_KNOCKOUT: 'Grupos + eliminación directa',
    GROUPS_CUPS: 'Grupos + copas',
    KNOCKOUT: 'Eliminación directa simple',
    GROUPS_POSITION_PLAYOFFS: 'Grupos + cruces de posiciones',
    SWISS: 'Suizo',
    DOUBLE_ELIMINATION: 'Doble eliminación',
  },
  descriptions: {
    ROUND_ROBIN: 'Todos juegan contra todos. Gana quien más puntos suma.',
    GROUPS_KNOCKOUT: 'Los equipos juegan en grupos y los mejores pasan a una llave de eliminación.',
    GROUPS_CUPS: 'Después de los grupos, cada posición disputa una copa hasta el final.',
    KNOCKOUT: 'Llave de eliminación desde el primer partido.',
    GROUPS_POSITION_PLAYOFFS: 'Los equipos juegan grupos y luego cruces según su posición.',
    SWISS: 'En cada ronda se enfrentan equipos con rendimiento parecido sin repetir rivales.',
    DOUBLE_ELIMINATION: 'Cada equipo queda eliminado recién cuando pierde dos veces.',
  },
  'format.notEnoughTeams': 'Se necesitan al menos 2 equipos.',
  'format.swissNeedsFourTeams': 'El suizo necesita al menos 4 equipos.',
  'format.doubleEliminationNeedsThreeTeams': 'La doble eliminación necesita al menos 3 equipos.',
  'format.groupsNeedsFourTeams': 'Los formatos con grupos necesitan al menos 4 equipos.',
  'format.unevenGroups':
    'Los grupos quedan desparejos; la comparación entre grupos descarta partidos según la regla definida.',
  'format.knockoutByes':
    'La llave tendrá {count} bye(s); los recibirán los equipos mejor sembrados.',
  'format.doubleEliminationByes':
    'La llave de ganadores tendrá {count} bye(s); los recibirán los equipos mejor sembrados.',
  'format.fewSwissRounds': 'Hay pocas rondas para definir un campeón con claridad.',
  'format.validationTeamCount': 'Se necesitan al menos 2 equipos.',
  'format.validationTooManyGroups': 'No puede haber más grupos que la mitad de los equipos.',
  'format.validationQualifiersZero': 'Debe haber al menos un clasificado por grupo.',
  'format.validationQualifiersTooHigh':
    'Los clasificados no pueden superar el grupo más chico ({size} equipos).',
  'format.validationSwissRounds': 'Las rondas suizas deben estar entre 1 y n-1.',
};
