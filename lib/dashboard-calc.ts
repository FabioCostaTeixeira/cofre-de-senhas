export type Periodo = 'hoje' | 'semana' | 'mes';

export type IntervaloPeriodo = { inicio: string; fim: string; dias: number };

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `hoje` é injetável pra testar; em produção sempre `new Date()`. Segue a mesma
 * convenção de `hojeISO()` em components/AgendaClient.tsx: monta a data local com
 * `new Date(ano, mes, dia)` e usa `toISOString().slice(0, 10)` só pra formatar
 * como string — não há troca de fuso aqui porque os três campos (ano/mês/dia) já
 * vêm de `getFullYear`/`getMonth`/`getDate`, que são locais.
 */
export function periodoParaIntervalo(periodo: Periodo, hoje: Date = new Date()): IntervaloPeriodo {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = hoje.getDate();

  if (periodo === 'hoje') {
    const inicio = new Date(ano, mes, dia);
    const fim = new Date(ano, mes, dia + 1);
    return { inicio: paraISO(inicio), fim: paraISO(fim), dias: 1 };
  }

  if (periodo === 'semana') {
    const diaSemana = hoje.getDay(); // 0=domingo..6=sábado
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
