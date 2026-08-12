import { validarPeriodoAgendamento } from '@/lib/agenda-form';
import type { DadosOS, DadosOSItem } from '@/lib/types';

function lerItemOS(bruto: unknown): DadosOSItem | { error: string } {
  if (
    typeof bruto !== 'object' || bruto === null ||
    typeof (bruto as Record<string, unknown>).produto_id !== 'string' ||
    typeof (bruto as Record<string, unknown>).quantidade !== 'number' ||
    typeof (bruto as Record<string, unknown>).pre_agendar !== 'boolean'
  ) {
    return { error: 'Itens inválidos.' };
  }
  const { produto_id, quantidade, pre_agendar } = bruto as {
    produto_id: string; quantidade: number; pre_agendar: boolean;
  };

  if (!produto_id) return { error: 'Escolha o produto de cada item.' };
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: 'Quantidade precisa ser um número inteiro maior que zero.' };
  }

  if (!pre_agendar) {
    return {
      produto_id, quantidade, pre_agendar: false,
      data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
    };
  }

  const b = bruto as Record<string, unknown>;
  const local_id = String(b.local_id ?? '');
  if (!local_id) return { error: 'Escolha o local de gravação do item pré-agendado.' };
  const estudio_id = String(b.estudio_id ?? '');
  if (!estudio_id) return { error: 'Escolha o estúdio do item pré-agendado.' };

  const data = String(b.data ?? '');
  const hora_inicio = String(b.hora_inicio ?? '');
  const hora_fim = String(b.hora_fim ?? '');
  const erroPeriodo = validarPeriodoAgendamento(data, hora_inicio, hora_fim);
  if (erroPeriodo) return erroPeriodo;

  return { produto_id, quantidade, pre_agendar: true, data, hora_inicio, hora_fim, local_id, estudio_id };
}

export function lerDadosOS(fd: FormData): DadosOS | { error: string } {
  const cliente_id = String(fd.get('clienteId') ?? '');
  if (!cliente_id) return { error: 'Escolha o cliente.' };

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(fd.get('itens') ?? '[]'));
  } catch {
    return { error: 'Itens inválidos.' };
  }
  if (!Array.isArray(bruto) || bruto.length === 0) return { error: 'Adicione pelo menos um item.' };

  const itens: DadosOSItem[] = [];
  for (const item of bruto) {
    const lido = lerItemOS(item);
    if ('error' in lido) return lido;
    itens.push(lido);
  }

  return { cliente_id, itens };
}
