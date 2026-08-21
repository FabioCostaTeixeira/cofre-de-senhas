const FUSO = 'America/Sao_Paulo';

// Hoisted: `corPorDeadline` roda uma vez por card por render, e construir um
// Intl.DateTimeFormat não é barato. Mesmo padrão de lib/dashboard-calc.ts.
const FORMATADOR_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Y-M-D do instante dado, no fuso de Brasília. Mesma razão de lib/formato.ts: o
 *  servidor da Vercel roda em UTC, e "quantos dias faltam" tem que ser contado no dia
 *  que o usuário está vivendo, não no do servidor. */
function diaBrasilia(d: Date): string {
  return FORMATADOR_DIA.format(d);
}

/**
 * Normaliza pra `YYYY-MM-DD` aceitando string ou Date.
 *
 * Aceitar Date não é conveniência: o driver do Neon parseia colunas `date` E
 * `timestamptz` como objeto `Date`, mesmo com o tipo declarado `string` em
 * lib/types.ts. Uma query que esqueça o `::text` entrega Date aqui, e `.slice`
 * num Date estoura — foi exatamente esse o bug que derrubou a aba Compras do
 * cliente antes. Normalizar aqui fecha a classe inteira, em vez de depender de
 * todo autor de query futuro lembrar do cast.
 */
function paraDiaISO(valor: string | Date): string {
  return valor instanceof Date ? diaBrasilia(valor) : valor.slice(0, 10);
}

export type CorPrazo = 'verde' | 'amarelo' | 'vermelho' | 'neutro';

export function corPorDeadline(
  deadline: string | Date | null, hoje: Date = new Date(),
): CorPrazo {
  if (!deadline) return 'neutro';
  const dias = diasEntre(diaBrasilia(hoje), paraDiaISO(deadline));
  if (Number.isNaN(dias)) return 'neutro';
  if (dias >= 4) return 'verde';
  if (dias >= 2) return 'amarelo';
  return 'vermelho';
}

/** Dias inteiros entre duas datas Y-M-D, tratadas como datas puras (sem hora/fuso). */
function diasEntre(de: string, ate: string): number {
  const [ay, am, ad] = de.split('-').map(Number);
  const [by, bm, bd] = ate.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export type OrdenavelTarefa = {
  ajuste: boolean;
  prioridade: number;
  /** String ISO ou Date — ver `paraDiaISO`. */
  created_at: string | Date;
};

/** Ajuste no topo, depois prioridade asc, empate pelo mais antigo. Retorna array novo. */
export function ordenarTarefas<T extends OrdenavelTarefa>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    if (a.ajuste !== b.ajuste) return a.ajuste ? -1 : 1;
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    // getTime() em vez de localeCompare: created_at pode chegar como Date (ver
    // `paraDiaISO`), e Date não tem localeCompare.
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
