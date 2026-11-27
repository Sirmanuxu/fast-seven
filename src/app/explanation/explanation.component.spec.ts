import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ExplanationComponent } from './explanation.component';

describe('ExplanationComponent', () => {
  let fixture: ComponentFixture<ExplanationComponent>;

  it('reveals its explanation from an accessible summary', async () => {
    await TestBed.configureTestingModule({
      imports: [ExplanationComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ExplanationComponent);
    fixture.componentRef.setInput('text', 'Se aplicó el desempate configurado.');
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    const summary = fixture.nativeElement.querySelector('summary') as HTMLElement;

    expect(details.open).toBe(false);
    expect(summary.textContent).toContain('¿Por qué?');
    expect(fixture.nativeElement.textContent).toContain('Se aplicó el desempate configurado.');
  });
});
