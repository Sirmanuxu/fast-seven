export const SPIKE_STRINGS = {
  offlineReady: 'Listo para usar sin conexión',
  offlinePending: 'Verificando el modo sin conexión',
  offlineDevelopment: 'Modo sin conexión disponible al ejecutar la versión publicada',
  persistenceGranted: 'Almacenamiento persistente concedido',
  persistenceDenied:
    'El navegador no confirmó almacenamiento persistente. Tus datos siguen guardándose localmente.',
  persistenceUnsupported:
    'Este navegador no permite consultar almacenamiento persistente. Tus datos siguen guardándose localmente.',
  popupBlocked:
    'El navegador bloqueó la ventana del proyector. Permití las ventanas emergentes para este sitio y probá de nuevo.',
  projectorConnected: 'Proyector conectado',
  projectorWaiting: 'Esperando mensajes del panel',
  saveTest: 'Guardar prueba',
  openProjector: 'Abrir proyector',
  openFixture: 'Fixture',
  panelTitle: 'Panel',
  startTournament: 'Iniciar torneo',
  confirmTournamentStart:
    'Al iniciar el torneo, quedarán bloqueados el formato, la regeneración del fixture y el alta o baja de equipos. Para cambiar esa estructura, primero habrá que reiniciarlo. ¿Querés continuar?',
  tournamentStarted: 'Torneo iniciado. La estructura quedó bloqueada.',
  startTournamentFailed: 'No se pudo iniciar el torneo. Revisá que el fixture esté generado.',
  tournamentInProgress: 'El torneo está en curso.',
  projectorTitle: 'Proyector de prueba',
  projectorInstructions:
    'Arrastrá la ventana del proyector al monitor externo. Usá el botón de pantalla completa dentro de esa ventana.',
  projectorConnectedStatus: 'Proyector conectado',
  projectorDisconnectedStatus: 'Proyector desconectado',
  projectorFullscreen: 'Pantalla completa',
  projectorConnectionLive: 'Conectado al panel',
} as const;
