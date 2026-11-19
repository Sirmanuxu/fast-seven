import { Routes } from '@angular/router';
import { PanelComponent } from './panel.component';
import { ProjectorComponent } from './projector.component';

export const routes: Routes = [
  { path: 'panel', component: PanelComponent },
  { path: 'proyector', component: ProjectorComponent },
  { path: '', redirectTo: 'panel', pathMatch: 'full' },
  { path: '**', redirectTo: 'panel' },
];
