export const PERSISTENCE_STRINGS = {
  loading: 'Cargando torneo…',
  databaseUnavailableTitle: 'IndexedDB no está disponible',
  databaseUnavailable:
    'Fast Seven no puede guardar datos en este navegador o modo privado. Cerrá el modo privado, habilitá el almacenamiento del sitio y recargá la página.',
  welcomeTitle: 'Fast Seven',
  welcomePrompt: 'Cargá el nombre del torneo para comenzar.',
  tournamentNameLabel: 'Nombre del torneo',
  createTournament: 'Crear torneo',
  nameRequired: 'Ingresá el nombre del torneo.',
  createFailed:
    'No se pudo guardar el torneo. Cerrá el modo privado, habilitá el almacenamiento y probá de nuevo.',
  persistenceDenied:
    'El navegador no confirmó almacenamiento persistente. Tus datos siguen guardándose localmente; guardá una copia periódicamente.',
  savedPrefix: 'Guardado',
  saveFailed: 'No se pudo guardar. Revisá el almacenamiento del navegador.',
} as const;
