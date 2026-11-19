import { Routes } from '@angular/router';
import { PanelComponent } from './panel.component';
import { ProjectorComponent } from './projector.component';
import { WelcomeComponent } from './welcome.component';

export const routes: Routes = [
  { path: 'bienvenida', component: WelcomeComponent },
  { path: 'panel', component: PanelComponent },
  { path: 'proyector', component: ProjectorComponent },
  { path: '', component: WelcomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: 'bienvenida' },
];
