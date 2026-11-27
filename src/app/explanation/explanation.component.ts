import { Component, input } from '@angular/core';
import { EXPLANATION_STRINGS } from '../../i18n/explanations-strings';

@Component({
  selector: 'app-explanation',
  templateUrl: './explanation.component.html',
  styleUrl: './explanation.component.css',
})
export class ExplanationComponent {
  readonly label = input<string>(EXPLANATION_STRINGS.why);
  readonly text = input.required<string>();
}
