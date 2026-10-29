/**
 * Datas da visão de calendário mensal. Tudo em UTC pra não depender do fuso do
 * servidor/navegador: só trabalha com strings `YYYY-MM-DD` / `YYYY-MM`.
 */

function utc(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Hoje no fuso de quem está vendo (toISOString viraria o dia às 21h em Brasília). */
export function hojeLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mesValido(mes: string | undefined): mes is string {
  return !!mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

export function mesDe(data: string) {
  return data.slice(0, 7);
}

export function somarMeses(mes: string, qtd: number) {
  const d = utc(`${mes}-01`);
  d.setUTCMonth(d.getUTCMonth() + qtd);
  return iso(d).slice(0, 7);
}

/** Dias exibidos na grade do mês: de segunda antes do dia 1 até domingo depois do último dia. */
export function diasDaGradeDoMes(mes: string): string[] {
  const inicio = utc(`${mes}-01`);
  const diaSemana = inicio.getUTCDay();
  inicio.setUTCDate(inicio.getUTCDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  const fim = utc(`${somarMeses(mes, 1)}-01`);
  fim.setUTCDate(fim.getUTCDate() - 1);
  const diaSemanaFim = fim.getUTCDay();
  fim.setUTCDate(fim.getUTCDate() + (diaSemanaFim === 0 ? 0 : 7 - diaSemanaFim));

  const dias: string[] = [];
  for (const d = inicio; d <= fim; d.setUTCDate(d.getUTCDate() + 1)) dias.push(iso(d));
  return dias;
}

/** "outubro 2026" */
export function rotuloMes(mes: string) {
  const nome = utc(`${mes}-01`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  return `${nome} ${mes.slice(0, 4)}`;
}
