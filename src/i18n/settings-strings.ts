export const SETTINGS_STRINGS = {
  title: 'Ajustes',
  backToPanel: 'Volver al panel',
  backupIntervalTitle: 'Copias automáticas',
  backupIntervalDescription:
    'Elegí cada cuántos minutos se crea una copia si hubo cambios. Se permiten valores de 1 a 60 minutos.',
  backupIntervalLabel: 'Intervalo entre copias (minutos)',
  saveBackupInterval: 'Guardar intervalo',
  backupIntervalInvalid: 'Ingresá un intervalo entero entre 1 y 60 minutos.',
  backupIntervalSaved: 'Se guardó el intervalo de las copias automáticas.',
  backupIntervalSaveFailed: 'No se pudo guardar el intervalo de las copias automáticas.',
  fileWarningTitle: 'Aviso de archivo sin guardar',
  fileWarningDescription:
    'Elegí después de cuántos minutos sin guardar el torneo a un archivo querés recibir un aviso. Usá un valor entre 1 y 1440.',
  fileWarningLabel: 'Minutos antes del aviso',
  saveFileWarning: 'Guardar aviso',
  fileWarningInvalid: 'Ingresá una cantidad entera entre 1 y 1440 minutos.',
  fileWarningSaved: 'Se guardó el intervalo del aviso.',
  fileWarningSaveFailed: 'No se pudo guardar el intervalo del aviso.',
  newTournamentTitle: 'Nuevo torneo',
  newTournamentDescription:
    'Se eliminarán el torneo actual, jugadores, equipos, etapas, grupos, partidos, eventos y sorteos. Las copias automáticas se conservarán. Antes de continuar, acordate de guardar el archivo del torneo fuera del navegador: la copia automática no lo reemplaza.',
  newTournament: 'Nuevo torneo',
  confirmNewTournament:
    'Esta acción elimina el torneo y todos sus datos de trabajo. Se conservarán las copias automáticas locales. Acordate de guardar el archivo del torneo fuera del navegador. Escribí BORRAR para confirmar.',
  newTournamentFailed: 'No se pudo borrar el torneo. No se modificaron los datos.',
  resetFixtureTitle: 'Reiniciar fixture',
  resetFixtureDescription:
    'Se borrarán las etapas, grupos, partidos, eventos y sorteos del fixture. Se conservarán jugadores y equipos, se reactivarán todos los equipos y se mantendrán los sorteos de armado de equipos.',
  resetFixtureUnavailable: 'Esta acción está disponible únicamente con el torneo en curso.',
  confirmResetFixture:
    'Se creará una copia automática y se borrarán las etapas, grupos, partidos, eventos y sorteos del fixture. Se conservarán jugadores y equipos. ¿Querés continuar?',
  confirmResetFixtureAgain:
    'Segunda confirmación: el torneo volverá a configuración y tendrás que generar el fixture de nuevo. ¿Reiniciar fixture?',
  resetFixture: 'Reiniciar fixture',
  resetFixtureDone: 'El fixture se reinició. Los jugadores y equipos siguen disponibles.',
  resetFixtureFailed: 'No se pudo reiniciar el fixture. No se modificaron los datos.',
  tournamentLoadFailed: 'No se pudo cargar el torneo para mostrar los ajustes.',
} as const;
