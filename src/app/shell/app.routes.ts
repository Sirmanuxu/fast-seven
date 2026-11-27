import { Routes } from '@angular/router';
import { PanelComponent } from '../panel/panel.component';
import { WelcomeComponent } from '../welcome/welcome.component';
import { PlayersComponent } from '../players/players.component';
import { TeamsComponent } from '../teams/teams.component';
import { ImportComponent } from '../import/import.component';
import { RulesComponent } from '../rules/rules.component';
import { FormatComponent } from '../format/format.component';
import { FixtureComponent } from '../fixture/fixture.component';
import { SettingsComponent } from '../settings/settings.component';

export const routes: Routes = [
  { path: 'bienvenida', component: WelcomeComponent },
  { path: 'panel', component: PanelComponent },
  { path: 'panel/reglas', component: RulesComponent },
  { path: 'panel/formato', component: FormatComponent },
  { path: 'panel/fixture', component: FixtureComponent },
  { path: 'panel/ajustes', component: SettingsComponent },
  {
    path: 'panel/respaldo',
    loadComponent: () =>
      import('../backups/backups.component').then((module) => module.BackupsComponent),
  },
  { path: 'jugadores', component: PlayersComponent },
  { path: 'panel/jugadores/importar', component: ImportComponent },
  { path: 'importar', component: ImportComponent },
  { path: 'equipos', component: TeamsComponent },
  { path: 'importar', component: ImportComponent },
  {
    path: 'proyector',
    loadComponent: () =>
      import('../projector/projector.component').then((module) => module.ProjectorComponent),
  },
  { path: '', component: WelcomeComponent, pathMatch: 'full' },
  { path: '**', redirectTo: 'bienvenida' },
];
