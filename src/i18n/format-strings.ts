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
  readonly totalMatches: string;
  readonly minMatchesPerTeam: string;
  readonly estimatedDuration: string;
  readonly warnings: string;
  readonly notViable: string;
  readonly params: string;
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
  saved: 'Formato guardado. Todavía no se generó el fixture.',
  saveFailed: 'No se pudo guardar el formato. Revisá el almacenamiento del navegador.',
  totalMatches: 'Partidos totales',
  minMatchesPerTeam: 'Partidos mínimos por equipo',
  estimatedDuration: 'Duración estimada',
  warnings: 'Advertencias',
  notViable: 'No disponible',
  params: 'Parámetros sugeridos',
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
  'format.unevenGroups': 'Los grupos quedan desparejos; la comparación entre grupos descarta partidos según la regla definida.',
  'format.knockoutByes': 'La llave tendrá {count} bye(s).',
  'format.doubleEliminationByes': 'La llave de ganadores tendrá {count} bye(s).',
  'format.fewSwissRounds': 'Hay pocas rondas para definir un campeón con claridad.',
};
