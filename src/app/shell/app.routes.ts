import { Routes } from '@angular/router';
import { PanelComponent } from '../panel/panel.component';
import { ProjectorComponent } from '../projector/projector.component';
import { WelcomeComponent } from '../welcome/welcome.component';
import { PlayersComponent } from '../players/players.component';
import { TeamsComponent } from '../teams/teams.component';
import { ImportComponent } from '../import/import.component';

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
