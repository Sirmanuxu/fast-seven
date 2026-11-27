export const PANEL_LOCK_STRINGS = {
  readOnly: 'Este panel está en solo lectura porque otra ventana tiene el control del torneo.',
  takeControl: 'Tomar control',
  takingControl: 'Esperando que la otra ventana libere el control…',
  takeControlFailed: 'No se pudo tomar el control. La otra ventana sigue activa.',
  unsupported:
    'Este navegador no permite asegurar un único panel. El torneo quedó en solo lectura; abrilo en Chrome o Edge.',
  failed: 'No se pudo iniciar el control del panel. El torneo quedó en solo lectura.',
  unexpectedShutdown: (lastSavedAt: string) =>
    `La sesión anterior se cerró inesperadamente. Último guardado: ${lastSavedAt}.`,
  unknownSaveTime: 'hora desconocida',
  reviewBackups: 'Revisar copias',
  dismiss: 'Cerrar aviso',
  writeFailed: 'Hay cambios sin guardar porque falló un guardado en el navegador.',
  saveToFile: 'Guardar torneo a archivo',
} as const;
