import { BackupReason } from '../domain/model';

export const BACKUP_REASON_LABELS: Readonly<Record<BackupReason, string>> = {
  TOURNAMENT_START: 'Inicio del torneo',
  MATCH_FINISHED: 'Partido finalizado',
  PERIODIC: 'Copia periódica',
  BEFORE_IMPORT: 'Antes de importar jugadores',
  BEFORE_LOAD_FILE: 'Antes de cargar un archivo',
  BEFORE_CASCADE_EDIT: 'Antes de una edición en cascada',
  BEFORE_RESET: 'Antes de reiniciar',
  MANUAL: 'Copia manual o restauración',
};

export const BACKUP_STRINGS = {
  title: 'Copias de seguridad',
  backToPanel: 'Volver al panel',
  description:
    'Las copias automáticas se guardan en este navegador. Guardá también una copia del torneo fuera del navegador.',
  empty: 'Todavía no hay copias de seguridad.',
  finishedMatches: (count: number) => `${count} partidos finalizados`,
  restore: 'Restaurar',
  confirmRestore: 'Se guardará una copia del estado actual antes de restaurar. ¿Querés continuar?',
  restored: 'Se restauró la copia de seguridad.',
  loadFailed: 'No se pudieron cargar las copias de seguridad.',
  restoreFailed: 'No se pudo restaurar la copia. No se modificaron los datos.',
  quotaWarning:
    'Se agotó el espacio disponible para las copias automáticas. Guardá el torneo a un archivo fuera del navegador.',
  periodicBackupFailed:
    'No se pudo crear una copia automática. Revisá el almacenamiento disponible.',
} as const;
