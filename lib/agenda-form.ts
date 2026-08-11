import type { DadosAgendamento, StatusAgendamento } from '@/lib/types';

const STATUS_VALIDOS: StatusAgendamento[] = [
  'cancelado', 'agendado', 'pre_agendado', 'gravando', 'concluido',
];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export function validarPeriodoAgendamento(
  data: string, horaInicio: string, horaFim: string,
): { error: string } | null {
  if (!DATA_RE.test(data)) return { error: 'Informe a data.' };
  if (!HORA_RE.test(horaInicio) || !HORA_RE.test(horaFim)) return { error: 'Informe o horário.' };
  if (horaParaMinutos(horaInicio) % 15 !== 0 || horaParaMinutos(horaFim) % 15 !== 0) {
    return { error: 'Horário precisa ser múltiplo de 15 minutos.' };
  }
  if (horaParaMinutos(horaFim) <= horaParaMinutos(horaInicio)) {
    return { error: 'Horário de fim precisa ser depois do início.' };
  }
  return null;
}

export function lerDadosAgendamento(fd: FormData): DadosAgendamento | { error: string } {
  const cliente_id = String(fd.get('clienteId') ?? '');
  if (!cliente_id) return { error: 'Escolha o cliente.' };

  const local_id = String(fd.get('localId') ?? '');
  if (!local_id) return { error: 'Escolha o local de gravação.' };

  const estudio_id = String(fd.get('estudioId') ?? '');
  if (!estudio_id) return { error: 'Escolha o estúdio.' };

  const categoria_produto_id = String(fd.get('categoriaId') ?? '');
  if (!categoria_produto_id) return { error: 'Escolha o tipo de gravação.' };

  const status = String(fd.get('status') ?? '');
  if (!STATUS_VALIDOS.includes(status as StatusAgendamento)) return { error: 'Status inválido.' };

  const data = String(fd.get('data') ?? '');
  const hora_inicio = String(fd.get('horaInicio') ?? '');
  const hora_fim = String(fd.get('horaFim') ?? '');
  const erroPeriodo = validarPeriodoAgendamento(data, hora_inicio, hora_fim);
  if (erroPeriodo) return erroPeriodo;

  return {
    cliente_id, local_id, estudio_id, categoria_produto_id,
    status: status as StatusAgendamento, data, hora_inicio, hora_fim,
  };
}
