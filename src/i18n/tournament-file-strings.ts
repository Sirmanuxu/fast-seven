export const TOURNAMENT_FILE_STRINGS = {
  save: 'Guardar torneo',
  saving: 'Preparando el archivo…',
  savedConfirmation: 'Se guardó el archivo del torneo.',
  lastSaved: (minutes: number) =>
    `Último archivo guardado hace ${minutes < 1 ? 'menos de 1' : minutes} min`,
  neverSaved: 'Todavía no guardaste un archivo del torneo.',
  unsavedWarning: (minutes: number) =>
    `Hay cambios sin guardar desde hace más de ${minutes} min. Guardá el torneo a un archivo.`,
  saveFailed: 'No se pudo guardar el archivo. El torneo sigue disponible en el navegador.',
  statusLoadFailed: 'No se pudo consultar el estado del archivo guardado.',
} as const;
