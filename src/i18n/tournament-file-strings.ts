export const TOURNAMENT_FILE_STRINGS = {
  save: 'Guardar torneo',
  saving: 'Preparando el archivo…',
  savedConfirmation: 'Se guardó el archivo del torneo.',
  load: 'Cargar torneo desde archivo',
  loading: 'Validando el archivo…',
  loaded: 'Se cargó el torneo y se guardó una copia del torneo anterior.',
  loadFailed: 'No se pudo cargar el archivo. El torneo actual no se modificó.',
  autoSaveFailed:
    'No se pudo guardar una copia en la carpeta elegida. El torneo sigue disponible; guardalo manualmente a un archivo.',
  autoSaveUnsupported:
    'Este navegador no permite elegir una carpeta para el autoguardado. Guardá el torneo a un archivo manualmente.',
  chooseAutoSaveDirectory: 'Elegir carpeta para copias',
  autoSaveDirectoryReady: 'Las copias se guardan automáticamente en la carpeta elegida.',
  autoSavePermissionRequired: 'La carpeta necesita permiso para guardar copias.',
  grantAutoSavePermission: 'Permitir acceso a la carpeta',
  removeAutoSaveDirectory: 'Dejar de usar esta carpeta',
  autoSaveDirectorySaved: 'Se eligió la carpeta y se guardó una copia del torneo.',
  autoSaveDirectoryRemoved: 'Se dejó de usar la carpeta para el autoguardado.',
  autoSaveDirectoryFailed: 'No se pudo configurar el autoguardado en la carpeta.',
  invalidJson: 'El archivo no contiene un JSON válido.',
  invalidFormat: 'El archivo no tiene el formato de un torneo de rugby seven.',
  newerSchema: 'El archivo fue creado con una versión más nueva de la aplicación.',
  unsupportedSchema: 'La versión del archivo no se puede cargar en esta aplicación.',
  checksumMismatch: 'El archivo está dañado: no coincide su checksum.',
  invalidStructure: 'El archivo está incompleto o tiene datos con formato incorrecto.',
  missingIds: 'El archivo no se puede cargar porque faltan identificadores únicos.',
  invalidReferences: 'El archivo contiene relaciones entre datos que no existen.',
  confirmLoad: (
    name: string,
    date: string,
    teams: number,
    finishedMatches: number,
    migrated: boolean,
    warnings: readonly string[],
  ) =>
    `Vas a reemplazar el torneo actual.\n\nTorneo: ${name}\nFecha: ${date}\nEquipos: ${teams}\nPartidos finalizados: ${finishedMatches}${migrated ? '\n\nEl archivo se va a actualizar al formato compatible.' : ''}${warnings.length > 0 ? `\n\nAvisos para revisar:\n${warnings.map((warning) => `• ${warning}`).join('\n')}` : ''}\n\n¿Querés continuar?`,
  invariantWarnings: {
    DUPLICATE_PLAYER_KEYS: 'Hay jugadores con claves repetidas sin aclaración de homónimos.',
    DUPLICATE_TEAM_NAMES: 'Hay equipos con nombres repetidos.',
    MULTIPLE_MATCHES_IN_PROGRESS: 'Hay más de un partido marcado como en juego.',
    DETAIL_SCORE_MISMATCH: 'El marcador de detalle no coincide con los eventos del partido.',
    ELIMINATION_TIE_WITHOUT_DECISION:
      'Hay un partido eliminatorio finalizado con empate y sin definición registrada.',
  },
  lastSaved: (minutes: number) =>
    `Último archivo guardado hace ${minutes < 1 ? 'menos de 1' : minutes} min`,
  neverSaved: 'Todavía no guardaste un archivo del torneo.',
  unsavedWarning: (minutes: number) =>
    `Hay cambios sin guardar desde hace más de ${minutes} min. Guardá el torneo a un archivo.`,
  saveFailed: 'No se pudo guardar el archivo. El torneo sigue disponible en el navegador.',
  statusLoadFailed: 'No se pudo consultar el estado del archivo guardado.',
  autoSaveStatusLoadFailed: 'No se pudo consultar el permiso de la carpeta de autoguardado.',
} as const;
