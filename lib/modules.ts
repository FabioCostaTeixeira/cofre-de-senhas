/**
 * Áreas da aplicação liberáveis por usuário (tabela `module_access`). O master enxerga
 * todas sem precisar de linha; usuário comum só as concedidas — inclusive Painel e
 * Working, que começam bloqueados (decisão do cliente, 2026-10-13).
 *
 * Fora do catálogo, de propósito: "Meus dados" (todo usuário ativo), Senhas (controlado
 * por sala) e administração — Salas admin, Auditoria, Lixeira e gestão de usuários
 * continuam só do master, porque quem gerencia usuário pode se dar permissão.
 *
 * Liberar uma área dá ver e editar tudo nela. A barreira real é `requireModulo()` em
 * cada página e server action; esconder o item do menu é só cosmético.
 *
 * `href` é a rota de entrada da área, usada como destino inicial de quem não tem o
 * Painel. A ordem do array é a ordem das caixas na tela de usuário.
 */
export type ModuleKey =
  | 'painel' | 'working' | 'agenda' | 'clientes' | 'fornecedores' | 'locais_gravacao'
  | 'produtos' | 'contratacoes' | 'ordens_servico' | 'ti';

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  href: string;
};

// Gestão de Projetos (`gestao`) comentada a pedido do cliente (2026-08-20): não deve
// aparecer no sidebar nem ser concedida daqui. Ela vive fora do Cofre (rewrite /gestao).
export const MODULES: ModuleDef[] = [
  { key: 'painel', label: 'Painel', href: '/' },
  { key: 'working', label: 'Working (Planejamento)', href: '/working/planejamento' },
  { key: 'agenda', label: 'Agenda', href: '/agenda' },
  { key: 'clientes', label: 'Clientes', href: '/cadastros/clientes' },
  { key: 'fornecedores', label: 'Fornecedores', href: '/cadastros/fornecedores' },
  { key: 'locais_gravacao', label: 'Locais de Gravação', href: '/cadastros/locais-gravacao' },
  { key: 'produtos', label: 'Produtos (categorias, combos e planos)', href: '/produtos' },
  { key: 'contratacoes', label: 'Contratações', href: '/contratacoes' },
  { key: 'ordens_servico', label: 'Ordens de Serviço', href: '/ordens-servico' },
  { key: 'ti', label: 'Projetos de TI', href: '/ti' },
];

export function isModuleKey(key: string): key is ModuleKey {
  return MODULES.some((m) => m.key === key);
}

/** Destino de quem não tem o Painel: a primeira área liberada, senão "Meus dados". */
export function rotaInicial(liberados: readonly string[]): string {
  return MODULES.find((m) => m.key !== 'painel' && liberados.includes(m.key))?.href
    ?? '/usuarios';
}
