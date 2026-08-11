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
  if (!DATA_RE.test(data)) return { error: 'Informe a data.' };

  const hora_inicio = String(fd.get('horaInicio') ?? '');
  const hora_fim = String(fd.get('horaFim') ?? '');
  if (!HORA_RE.test(hora_inicio) || !HORA_RE.test(hora_fim)) return { error: 'Informe o horário.' };

  if (horaParaMinutos(hora_inicio) % 15 !== 0 || horaParaMinutos(hora_fim) % 15 !== 0) {
    return { error: 'Horário precisa ser múltiplo de 15 minutos.' };
  }
  if (horaParaMinutos(hora_fim) <= horaParaMinutos(hora_inicio)) {
    return { error: 'Horário de fim precisa ser depois do início.' };
  }

  return {
    cliente_id, local_id, estudio_id, categoria_produto_id,
    status: status as StatusAgendamento, data, hora_inicio, hora_fim,
  };
}
