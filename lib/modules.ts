import type { LucideIcon } from 'lucide-react';
// import { FolderKanban } from 'lucide-react';

/**
 * Módulos externos disponíveis pra conceder acesso na tela de usuário. O Cofre em
 * si não entra aqui — todo usuário ativo já o acessa por definição. Cada módulo vira
 * seu próprio grupo no menu (não mais agrupado sob um "Módulos" genérico), daí o
 * `groupLabel` além do `label` do item em si. Novo módulo: adiciona uma entrada
 * aqui, nada mais muda no cadastro de usuário.
 */
export type ModuleDef = {
  key: string;
  groupLabel: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

// Gestão de Projetos comentada a pedido do cliente (2026-08-20): não deve mais
// aparecer no sidebar nem ser acessível daqui. Descomentar pra reativar.
export const MODULES: ModuleDef[] = [
  // { key: 'gestao', groupLabel: 'Gestão', label: 'Gestão de Projetos', href: '/gestao', icon: FolderKanban },
];
