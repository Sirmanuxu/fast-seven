import { Routes } from '@angular/router';
import { PanelComponent } from './panel.component';
import { ProjectorComponent } from './projector.component';
import { WelcomeComponent } from './welcome.component';
import { PlayersComponent } from './players.component';
import { TeamsComponent } from './teams.component';
import { ImportComponent } from './import.component';

export const routes: Routes = [
  { path: 'bienvenida', component: WelcomeComponent },
  { path: 'panel', component: PanelComponent },
  { path: 'jugadores', component: PlayersComponent },
  { path: 'equipos', component: TeamsComponent },
  { path: 'importar', component: ImportComponent },
  { path: 'proyector', component: ProjectorComponent },
  { path: '', component: WelcomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: 'bienvenida' },
];
