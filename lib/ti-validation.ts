const statusProjeto = new Set([
  'roadmap', 'backlog', 'planejamento', 'andamento', 'homologacao', 'concluido', 'cancelado',
]);

const statusTarefa = new Set([
  'roadmap', 'planejamento', 'a_fazer', 'progresso', 'homologacao', 'bloqueada', 'concluido',
]);

const statusAtividade = new Set([
  'roadmap', 'a_fazer', 'progresso', 'homologacao', 'bloqueada', 'concluido',
]);

const prioridades = new Set(['baixa', 'media', 'alta', 'critica']);

export function isStatusProjeto(valor: string): boolean {
  return statusProjeto.has(valor);
}

export function isStatusTarefa(valor: string): boolean {
  return statusTarefa.has(valor);
}

export function isStatusAtividade(valor: string): boolean {
  return statusAtividade.has(valor);
}

export function isPrioridadeTi(valor: string): boolean {
  return prioridades.has(valor);
}

export function parsePesoTi(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const peso = Number(valor);
  return Number.isFinite(peso) && peso >= 0 && peso <= 100 ? peso : null;
}
