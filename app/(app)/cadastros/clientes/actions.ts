'use server';

import { revalidatePath } from 'next/cache';
import { requireModulo } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { listAgendamentosDoCliente } from '@/lib/db/agenda';
import { listContratacoesDoCliente } from '@/lib/db/contratacoes';
import { createTerceiro, softDeleteTerceiro, updateTerceiro } from '@/lib/db/terceiros';
import { lerDadosTerceiro } from '@/lib/terceiros-form';
import { isUuid } from '@/lib/validation';
import type { TerceiroState } from '@/components/TerceiroClient';
import type { Agendamento, ContratacaoDoCliente } from '@/lib/types';

const TABELA = 'clientes' as const;
const ROTA = '/cadastros/clientes';

export async function criarCliente(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireModulo('clientes');
  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  const id = await createTerceiro(TABELA, dados);
  await audit({ actorId: actor.id, action: 'create', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Cliente cadastrado.' };
}

export async function salvarCliente(
  _prev: TerceiroState, formData: FormData,
): Promise<TerceiroState> {
  const actor = await requireModulo('clientes');
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Cliente não encontrado.' };

  const dados = lerDadosTerceiro(formData);
  if ('error' in dados) return dados;

  await updateTerceiro(TABELA, id, dados);
  await audit({ actorId: actor.id, action: 'update', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Cliente atualizado.' };
}

export async function apagarCliente(id: string): Promise<{ error?: string }> {
  const actor = await requireModulo('clientes');
  if (!isUuid(id)) return { error: 'Cliente não encontrado.' };

  await softDeleteTerceiro(TABELA, id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'cliente', entityId: id });
  revalidatePath(ROTA);
  return {};
}

/**
 * Busca o histórico de compras e agendamentos de um cliente, chamada direto do
 * cliente (não é submissão de formulário, então não passa por `useActionState`).
 * Mesmo guard de leitura da página (`requireModulo('clientes')`) — quem vê a lista de clientes
 * pode ver o histórico de qualquer um deles.
 */
export async function buscarDadosClienteAction(
  clienteId: string,
): Promise<{ contratacoes: ContratacaoDoCliente[]; agendamentos: Agendamento[] } | { error: string }> {
  await requireModulo('clientes');
  if (!isUuid(clienteId)) return { error: 'Cliente não encontrado.' };

  const [contratacoes, agendamentos] = await Promise.all([
    listContratacoesDoCliente(clienteId),
    listAgendamentosDoCliente(clienteId),
  ]);
  return { contratacoes, agendamentos };
}
