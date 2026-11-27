import { TournamentFile, TournamentSnapshot } from '../domain/model';
import { TOURNAMENT_SCHEMA_VERSION } from './tournament-database';

export async function checksumTournamentData(data: TournamentSnapshot): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Secure checksum support is unavailable in this browser');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createTournamentFile(
  data: TournamentSnapshot,
  appVersion: string,
  exportedAt: string,
): Promise<TournamentFile> {
  return {
    kind: 'rugby7-tournament',
    schemaVersion: TOURNAMENT_SCHEMA_VERSION,
    appVersion,
    exportedAt,
    checksum: await checksumTournamentData(data),
    data,
  };
}

export function createTournamentFileName(tournamentName: string, exportedAt: Date): string {
  const slug =
    tournamentName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-AR')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sin-nombre';
  const date = [
    exportedAt.getFullYear(),
    String(exportedAt.getMonth() + 1).padStart(2, '0'),
    String(exportedAt.getDate()).padStart(2, '0'),
  ].join('');
  const time = `${String(exportedAt.getHours()).padStart(2, '0')}${String(exportedAt.getMinutes()).padStart(2, '0')}`;
  return `torneo-${slug}-${date}-${time}.json`;
}
