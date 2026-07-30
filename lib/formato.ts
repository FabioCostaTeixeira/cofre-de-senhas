/**
 * Formatação de data e hora.
 *
 * As páginas são renderizadas no servidor, e o servidor da Vercel roda em UTC.
 * Sem fixar o fuso aqui, a auditoria e a lixeira mostrariam horários três horas
 * à frente do que o usuário viveu. O fuso é fixo em Brasília de propósito: o
 * cofre é de uma equipe só, e um horário de auditoria precisa ser o mesmo para
 * todo mundo que o lê.
 */
const FUSO = 'America/Sao_Paulo';

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Ex.: 30/07/2026, 11:16:21 (horário de Brasília). */
export function formatarDataHora(valor: string | Date): string {
  return dataHora.format(new Date(valor));
}
