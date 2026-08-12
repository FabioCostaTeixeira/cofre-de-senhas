'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { cancelarOrdemServico, ConflitoAgendaError, createOrdemServico, SaldoInsuficienteError } from '@/lib/db/ordens-servico';
import { lerDadosOS } from '@/lib/os-form';
import { isUuid } from '@/lib/validation';
import type { OSState } from '@/components/OSClient';

const ROTA = '/ordens-servico';

export async function criarOS(_prev: OSState, formData: FormData): Promise<OSState> {
  const actor = await requireMaster();
  const dados = lerDadosOS(formData);
  if ('error' in dados) return dados;

  let id: string;
  try {
    id = await createOrdemServico(dados);
  } catch (err) {
    if (err instanceof SaldoInsuficienteError || err instanceof ConflitoAgendaError) return { error: err.message };
    throw err;
  }
  await audit({ actorId: actor.id, action: 'create', entityType: 'ordem_servico', entityId: id });
  revalidatePath(ROTA);
  return { ok: 'Ordem de serviço criada.' };
}

export async function cancelarOS(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster();
  if (!isUuid(id)) return { error: 'Ordem de serviço não encontrada.' };

  await cancelarOrdemServico(id);
  await audit({ actorId: actor.id, action: 'delete', entityType: 'ordem_servico', entityId: id });
  revalidatePath(ROTA);
  return {};
}
