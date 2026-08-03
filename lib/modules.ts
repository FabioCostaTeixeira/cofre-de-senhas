/**
 * Módulos externos disponíveis pra conceder acesso na tela de usuário. O Cofre em
 * si não entra aqui — todo usuário ativo já o acessa por definição. Novo módulo:
 * adiciona uma entrada aqui, nada mais muda no cadastro de usuário.
 */
export type ModuleDef = { key: string; label: string; href: string };

export const MODULES: ModuleDef[] = [
  { key: 'gestao', label: 'Gestão de Projetos', href: '/gestao' },
];
