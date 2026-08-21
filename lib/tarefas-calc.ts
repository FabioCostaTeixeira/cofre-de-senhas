const FUSO = 'America/Sao_Paulo';

/** Y-M-D do instante dado, no fuso de Brasília. Mesma razão de lib/formato.ts: o
 *  servidor da Vercel roda em UTC, e "quantos dias faltam" tem que ser contado no dia
 *  que o usuário está vivendo, não no do servidor. */
function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Dias inteiros entre duas datas Y-M-D, tratadas como datas puras (sem hora/fuso). */
function diasEntre(de: string, ate: string): number {
  const [ay, am, ad] = de.split('-').map(Number);
  const [by, bm, bd] = ate.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export type CorPrazo = 'verde' | 'amarelo' | 'vermelho' | 'neutro';

export function corPorDeadline(deadline: string | null, hoje: Date = new Date()): CorPrazo {
  if (!deadline) return 'neutro';
  const dias = diasEntre(diaBrasilia(hoje), deadline.slice(0, 10));
  if (dias >= 4) return 'verde';
  if (dias >= 2) return 'amarelo';
  return 'vermelho';
}

export type OrdenavelTarefa = { ajuste: boolean; prioridade: number; created_at: string };

/** Ajuste no topo, depois prioridade asc, empate pelo mais antigo. Retorna array novo. */
export function ordenarTarefas<T extends OrdenavelTarefa>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    if (a.ajuste !== b.ajuste) return a.ajuste ? -1 : 1;
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return a.created_at.localeCompare(b.created_at);
  });
}
