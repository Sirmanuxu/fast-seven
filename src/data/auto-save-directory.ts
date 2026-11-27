import { TournamentFile, TournamentSnapshot } from '../domain/model';
import { tournamentRepository } from './tournament-repository';
import { AutoSaveDirectoryHandle, tournamentDatabase } from './tournament-database';
import { createTournamentFile, createTournamentAutoSaveFileName } from './tournament-file';
import { autoSaveWriteFailed, autoSaveWriteSucceeded } from './backup-events';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    readonly mode: 'readwrite';
  }) => Promise<AutoSaveDirectoryHandle>;
}

export type AutoSaveDirectoryResult = 'SAVED' | 'UNCONFIGURED' | 'PERMISSION_REQUIRED';

function directoryPickerWindow(): DirectoryPickerWindow {
  return window as DirectoryPickerWindow;
}

export function supportsAutoSaveDirectory(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof directoryPickerWindow().showDirectoryPicker === 'function'
  );
}

export async function chooseAutoSaveDirectory(): Promise<AutoSaveDirectoryHandle> {
  const picker = directoryPickerWindow().showDirectoryPicker;
  if (!picker) throw new DOMException('Directory selection is not supported', 'NotSupportedError');

  const handle = await picker.call(directoryPickerWindow(), { mode: 'readwrite' });
  await tournamentDatabase.transaction('rw', tournamentDatabase.autoSaveDirectory, async () => {
    await tournamentDatabase.autoSaveDirectory.put({ id: 'current', handle });
  });
  return handle;
}

export async function getAutoSaveDirectoryHandle(): Promise<AutoSaveDirectoryHandle | null> {
  return (await tournamentDatabase.autoSaveDirectory.get('current'))?.handle ?? null;
}

export async function removeAutoSaveDirectory(): Promise<void> {
  await tournamentDatabase.transaction('rw', tournamentDatabase.autoSaveDirectory, async () => {
    await tournamentDatabase.autoSaveDirectory.delete('current');
  });
}

export async function getAutoSaveDirectoryPermission(
  handle: AutoSaveDirectoryHandle,
): Promise<PermissionState> {
  return handle.queryPermission({ mode: 'readwrite' });
}

export async function requestAutoSaveDirectoryPermission(
  handle: AutoSaveDirectoryHandle,
): Promise<PermissionState> {
  return handle.requestPermission({ mode: 'readwrite' });
}

export async function saveSnapshotToAutoSaveDirectory(
  snapshot: TournamentSnapshot,
  appVersion: string,
  handle?: AutoSaveDirectoryHandle,
): Promise<AutoSaveDirectoryResult> {
  const directory = handle ?? (await getAutoSaveDirectoryHandle());
  if (!directory) return 'UNCONFIGURED';
  try {
    if ((await getAutoSaveDirectoryPermission(directory)) !== 'granted') {
      return 'PERMISSION_REQUIRED';
    }
  } catch (error) {
    autoSaveWriteFailed.next();
    throw error;
  }

  const exportedAt = new Date();
  const exportedAtIso = exportedAt.toISOString();
  let tournamentFile: TournamentFile;
  let writable: FileSystemWritableFileStream | null = null;
  try {
    tournamentFile = await createTournamentFile(snapshot, appVersion, exportedAtIso);
    const output = await directory.getFileHandle(
      createTournamentAutoSaveFileName(snapshot.tournament.name),
      { create: true },
    );
    writable = await output.createWritable();
    await writable.write(JSON.stringify(tournamentFile, null, 2));
    await writable.close();
  } catch (error) {
    autoSaveWriteFailed.next();
    if (writable) {
      await writable.abort().catch((abortError: unknown) => {
        console.error('Aborting the failed tournament auto-save failed', abortError);
      });
    }
    throw error;
  }

  await tournamentRepository.recordTournamentFileExport(
    snapshot.tournament.id,
    exportedAtIso,
    tournamentFile.checksum,
  );
  autoSaveWriteSucceeded.next();
  return 'SAVED';
}
