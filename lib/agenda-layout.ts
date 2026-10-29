/**
 * Distribui os blocos de um dia (agendamentos e bloqueios) em colunas lado a lado
 * para que horários sobrepostos não fiquem um em cima do outro. Blocos que se
 * sobrepõem (direta ou indiretamente) formam um grupo; dentro do grupo cada bloco
 * fica na primeira coluna livre, e todos dividem a largura pelo total de colunas
 * do grupo. Blocos sem sobreposição ocupam a largura inteira.
 */

export type BlocoHorario = { id: string; horaInicio: string; horaFim: string };
export type PosicaoColuna = { coluna: number; total: number };

function minutos(hora: string) {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function distribuirEmColunas(blocos: BlocoHorario[]): Map<string, PosicaoColuna> {
  const ordenados = blocos
    .map((b) => ({ id: b.id, inicio: minutos(b.horaInicio), fim: minutos(b.horaFim) }))
    .sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const resultado = new Map<string, PosicaoColuna>();
  let grupo: { id: string; coluna: number }[] = [];
  let fimColunas: number[] = [];
  let fimGrupo = -Infinity;

  const fecharGrupo = () => {
    for (const { id, coluna } of grupo) resultado.set(id, { coluna, total: fimColunas.length });
    grupo = [];
    fimColunas = [];
  };

  for (const bloco of ordenados) {
    if (bloco.inicio >= fimGrupo) fecharGrupo();
    let coluna = fimColunas.findIndex((fim) => fim <= bloco.inicio);
    if (coluna === -1) coluna = fimColunas.push(bloco.fim) - 1;
    else fimColunas[coluna] = bloco.fim;
    grupo.push({ id: bloco.id, coluna });
    fimGrupo = Math.max(fimGrupo, bloco.fim);
  }
  fecharGrupo();
  return resultado;
}

/** Cores que identificam cada estúdio na visão "Todos os estúdios" (por posição no local). */
export const CORES_ESTUDIO = ['#a855f7', '#f97316', '#ec4899', '#14b8a6', '#84cc16', '#6366f1', '#f43f5e', '#0ea5e9'];

export function corDoEstudio(indice: number) {
  return CORES_ESTUDIO[indice % CORES_ESTUDIO.length];
}
