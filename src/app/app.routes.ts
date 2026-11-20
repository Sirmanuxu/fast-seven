import { Routes } from '@angular/router';
import { PanelComponent } from './panel.component';
import { ProjectorComponent } from './projector.component';
import { WelcomeComponent } from './welcome.component';
import { PlayersComponent } from './players.component';
import { TeamsComponent } from './teams.component';
import { TeamAssignmentComponent } from './team-assignment.component';

export const routes: Routes = [
  { path: 'bienvenida', component: WelcomeComponent },
  { path: 'panel', component: PanelComponent },
  { path: 'jugadores', component: PlayersComponent },
  { path: 'equipos', component: TeamsComponent },
  { path: 'asignar-jugadores', component: TeamAssignmentComponent },
  { path: 'proyector', component: ProjectorComponent },
  { path: '', component: WelcomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: 'bienvenida' },
];
