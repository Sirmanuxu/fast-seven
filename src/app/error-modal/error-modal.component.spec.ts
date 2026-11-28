import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissErrorModal, showErrorModal } from '../error-popup';
import { ErrorModalComponent } from './error-modal.component';

const showModalDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

describe('ErrorModalComponent', () => {
  let fixture: ComponentFixture<ErrorModalComponent>;

  beforeEach(async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    await TestBed.configureTestingModule({
      imports: [ErrorModalComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ErrorModalComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    dismissErrorModal();
    vi.restoreAllMocks();
    if (showModalDescriptor) {
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    }
    if (closeDescriptor) {
      Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
    }
  });

  it('displays the modal title and message with alert-dialog semantics', async () => {
    showErrorModal({ title: 'No se pudo guardar', message: 'Probá otra vez.' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('No se pudo guardar');
    expect(dialog?.textContent).toContain('Probá otra vez.');
  });

  it('runs the requested action and closes the modal', async () => {
    const action = vi.fn();
    showErrorModal({
      title: 'No se pudo guardar',
      message: 'El torneo sigue disponible.',
      primaryActionLabel: 'Guardar a archivo',
      onPrimaryAction: action,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    buttons.find((button) => button.textContent?.trim() === 'Guardar a archivo')?.click();
    fixture.detectChanges();

    expect(action).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).querySelector('dialog')).toBeNull();
  });

  it('dismisses when the dialog receives an Escape cancellation', async () => {
    showErrorModal({ title: 'No se pudo guardar', message: 'Probá otra vez.' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('dialog')).toBeNull();
  });
});
