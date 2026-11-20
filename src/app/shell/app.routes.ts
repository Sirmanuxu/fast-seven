import { Routes } from '@angular/router';
import { PanelComponent } from '../panel/panel.component';
import { ProjectorComponent } from '../projector/projector.component';
import { WelcomeComponent } from '../welcome/welcome.component';
import { PlayersComponent } from '../players/players.component';
import { TeamsComponent } from '../teams/teams.component';
import { ImportComponent } from '../import/import.component';
import { RulesComponent } from '../rules/rules.component';

export const routes: Routes = [
  { path: 'bienvenida', component: WelcomeComponent },
  { path: 'panel', component: PanelComponent },
  { path: 'panel/reglas', component: RulesComponent },
  { path: 'jugadores', component: PlayersComponent },
  { path: 'panel/jugadores/importar', component: ImportComponent },
  { path: 'importar', component: ImportComponent },
  { path: 'equipos', component: TeamsComponent },
  { path: 'importar', component: ImportComponent },
  { path: 'proyector', component: ProjectorComponent },
  { path: '', component: WelcomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: 'bienvenida' },
];
