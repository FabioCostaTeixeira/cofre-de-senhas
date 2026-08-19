export type Periodo = 'hoje' | 'semana' | 'mes';

export type IntervaloPeriodo = { inicio: string; fim: string; dias: number };

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const FUSO = 'America/Sao_Paulo';

const formatoYMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * Extrai ano/mês/dia de `hoje` já convertidos pro fuso de Brasília. Necessário porque
 * `hoje.getFullYear()`/`getMonth()`/`getDate()` são sempre locais ao relógio do processo
 * que roda o código — em produção, o servidor da Vercel roda em UTC (mesmo motivo por
 * trás do fuso fixo em `lib/formato.ts`), então usar esses getters direto faria "Hoje"
 * virar amanhã já às 21h de Brasília. `Intl.DateTimeFormat` com `timeZone` explícito é a
 * única forma de ler ano/mês/dia num fuso arbitrário a partir de um `Date`; o locale
 * `en-CA` formata direto como `YYYY-MM-DD`, o que facilita o parse. `mes` retorna
 * 0-indexado pra bater com a convenção de `Date.getMonth()`/`new Date(ano, mes, dia)`.
 */
function anoMesDiaBrasilia(hoje: Date): { ano: number; mes: number; dia: number } {
  const [anoStr, mesStr, diaStr] = formatoYMD.format(hoje).split('-');
  return { ano: Number(anoStr), mes: Number(mesStr) - 1, dia: Number(diaStr) };
}

/**
 * `hoje` é injetável pra testar; em produção sempre `new Date()`. As datas de contorno
 * (início/fim de "hoje"/"semana"/"mês") são calculadas em cima do ano/mês/dia de
 * Brasília, não do fuso local do processo — ver `anoMesDiaBrasilia` acima. Um segundo
 * `Date` é reconstruído a partir desses três números (`new Date(ano, mes, dia)`) pra
 * poder usar `.getDay()`/aritmética de dias normalmente: um `Date` só expõe
 * `getDay()`/`getMonth()`/`getDate()` no fuso local do runtime, nunca num fuso IANA
 * arbitrário diretamente — daí a necessidade dos dois passos.
 */
export function periodoParaIntervalo(periodo: Periodo, hoje: Date = new Date()): IntervaloPeriodo {
  const { ano, mes, dia } = anoMesDiaBrasilia(hoje);
  const hojeBrasilia = new Date(ano, mes, dia);

  if (periodo === 'hoje') {
    const inicio = hojeBrasilia;
    const fim = new Date(ano, mes, dia + 1);
    return { inicio: paraISO(inicio), fim: paraISO(fim), dias: 1 };
  }

  if (periodo === 'semana') {
    const diaSemana = hojeBrasilia.getDay(); // 0=domingo..6=sábado, já em Brasília
    const deltaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
    const inicio = new Date(ano, mes, dia + deltaSegunda);
    const fim = new Date(ano, mes, dia + deltaSegunda + 7);
    return { inicio: paraISO(inicio), fim: paraISO(fim), dias: 7 };
  }

  const inicio = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 1);
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
  return { inicio: paraISO(inicio), fim: paraISO(fim), dias };
}

const JANELA_INICIO_MIN = 8 * 60;
const JANELA_FIM_MIN = 20 * 60;

export type BlocoTempo = { hora_inicio: string; hora_fim: string };

function paraMinutos(horaHHMMSS: string): number {
  const [h, m] = horaHHMMSS.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos do bloco que caem dentro de 08:00–20:00, nunca negativo. */
function minutosNaJanela(bloco: BlocoTempo): number {
  const inicio = Math.max(paraMinutos(bloco.hora_inicio), JANELA_INICIO_MIN);
  const fim = Math.min(paraMinutos(bloco.hora_fim), JANELA_FIM_MIN);
  return Math.max(fim - inicio, 0);
}

export type TempoStudio = { minutosLivres: number; minutosAgendados: number };

export function calcularTempoStudio(blocos: BlocoTempo[], dias: number): TempoStudio {
  const capacidadeMinutos = (JANELA_FIM_MIN - JANELA_INICIO_MIN) * dias;
  const minutosAgendados = blocos.reduce((soma, b) => soma + minutosNaJanela(b), 0);
  const minutosLivres = Math.max(capacidadeMinutos - minutosAgendados, 0);
  return { minutosLivres, minutosAgendados };
}

export function formatarMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
