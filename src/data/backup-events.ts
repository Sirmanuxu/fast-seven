import { Subject } from 'rxjs';
import { Backup } from '../domain/model';

export const backupQuotaExceeded = new Subject<void>();
export const backupCreated = new Subject<Backup>();
export const autoSaveWriteFailed = new Subject<void>();
export const autoSaveWriteSucceeded = new Subject<void>();

export function isQuotaExceededError(error: unknown): boolean {
  let current = error;
  while (typeof current === 'object' && current !== null) {
    if (
      typeof DOMException !== 'undefined' &&
      current instanceof DOMException &&
      current.name === 'QuotaExceededError'
    ) {
      return true;
    }
    if (!('inner' in current)) return false;
    current = current.inner;
  }
  return false;
}
