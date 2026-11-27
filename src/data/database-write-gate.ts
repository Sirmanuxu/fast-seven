import { Subject } from 'rxjs';

export const databaseWriteFailed = new Subject<void>();
export const databaseWriteSucceeded = new Subject<void>();

let writeAllowed = true;

export class DatabaseWriteBlockedError extends Error {
  constructor() {
    super('This panel does not own the database write lock');
    this.name = 'DatabaseWriteBlockedError';
  }
}

export function setDatabaseWriteAllowed(allowed: boolean): void {
  writeAllowed = allowed;
}

export function isDatabaseWriteAllowed(): boolean {
  return writeAllowed;
}
