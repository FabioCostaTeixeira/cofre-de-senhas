import { veTodosChamados, type AtorCard } from '@/lib/permissoes-cards';

export type FiltroChamados = 'todos' | 'abertos' | 'designados';

export const FILTROS_CHAMADOS: readonly { id: FiltroChamados; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'abertos', label: 'Abertos por mim' },
  { id: 'designados', label: 'Designados a mim' },
];

function isFiltro(valor: string | undefined): valor is FiltroChamados {
  return FILTROS_CHAMADOS.some((f) => f.id === valor);
}

export type VisaoChamados = {
  /** Master/gestor: tem as abas Geral/Individual. */
  temAbas: boolean;
  individual: boolean;
  /** Filtro pessoal em uso; null na aba Geral, que mostra todos os chamados. */
  filtro: FiltroChamados | null;
  /** Argumento de `listChamados`. */
  consulta: { envolvido?: string; responsavel?: string; criadoPor?: string };
};

/**
 * Visão do quadro Working › Projetos a partir da URL (`?visao=individual&filtro=…`).
 * O filtro pessoal (Todos / Abertos por mim / Designados a mim) vale para o usuário
 * comum e para a aba Individual de master/gestor. Cada um abre como era antes do
 * filtro existir: usuário comum em Todos, Individual em Designados a mim.
 */
export function resolverVisaoChamados(
  ator: AtorCard, params: { visao?: string; filtro?: string },
): VisaoChamados {
  const temAbas = veTodosChamados(ator);
  const individual = temAbas && params.visao === 'individual';
  if (temAbas && !individual) return { temAbas, individual, filtro: null, consulta: {} };

  const filtro = isFiltro(params.filtro) ? params.filtro : individual ? 'designados' : 'todos';
  const consulta = filtro === 'abertos' ? { criadoPor: ator.id }
    : filtro === 'designados' ? { responsavel: ator.id }
    : { envolvido: ator.id };
  return { temAbas, individual, filtro, consulta };
}
