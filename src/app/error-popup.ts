import { signal } from '@angular/core';
import { ERROR_MODAL_STRINGS } from '../i18n/error-modal-strings';

export interface ErrorModalOptions {
  readonly title: string;
  readonly message: string;
  readonly primaryActionLabel?: string;
  readonly secondaryActionLabel?: string;
  readonly onPrimaryAction?: () => void;
  readonly onSecondaryAction?: () => void;
  readonly onDismiss?: () => void;
}

const errorModal = signal<ErrorModalOptions | null>(null);

export const activeErrorModal = errorModal.asReadonly();

export function showErrorPopup(message: string): void {
  errorModal.set({
    title: ERROR_MODAL_STRINGS.title,
    message,
  });
}

export function showErrorModal(options: ErrorModalOptions): void {
  errorModal.set(options);
}

export function dismissErrorModal(): void {
  const current = errorModal();
  errorModal.set(null);
  current?.onDismiss?.();
}

export function runErrorModalPrimaryAction(): void {
  const current = errorModal();
  errorModal.set(null);
  current?.onPrimaryAction?.();
}

export function runErrorModalSecondaryAction(): void {
  const current = errorModal();
  errorModal.set(null);
  current?.onSecondaryAction?.();
}
