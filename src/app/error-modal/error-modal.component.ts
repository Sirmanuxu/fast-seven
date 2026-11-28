import { Component, effect, ElementRef, viewChild } from '@angular/core';
import {
  activeErrorModal,
  dismissErrorModal,
  runErrorModalPrimaryAction,
  runErrorModalSecondaryAction,
} from '../error-popup';
import { ERROR_MODAL_STRINGS } from '../../i18n/error-modal-strings';

@Component({
  selector: 'app-error-modal',
  templateUrl: './error-modal.component.html',
  styleUrl: './error-modal.component.css',
})
export class ErrorModalComponent {
  protected readonly strings = ERROR_MODAL_STRINGS;
  protected readonly errorModal = activeErrorModal;
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly syncDialog = effect(() => {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;

    if (this.errorModal() && !dialog.open) {
      dialog.showModal();
    } else if (!this.errorModal() && dialog.open) {
      dialog.close();
    }
  });

  protected dismiss(): void {
    dismissErrorModal();
  }

  protected runPrimaryAction(): void {
    runErrorModalPrimaryAction();
  }

  protected runSecondaryAction(): void {
    runErrorModalSecondaryAction();
  }

  protected preventNativeClose(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }
}
