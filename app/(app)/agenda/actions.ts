'use server';

import { revalidatePath } from 'next/cache';
import { requireMaster } from '@/lib/auth/guards';
import { audit } from '@/lib/db/audit';
import { ConflitoHorarioError, createAgendamento, moverOuRedimensionar, softDeleteAgendamento, updateAgendamento } from '@/lib/db/agenda';
import { lerDadosAgendamento } from '@/lib/agenda-form';
import { isUuid } from '@/lib/validation';
import type { AgendaFormState } from '@/components/AgendaFormularioModal';

const ROTA = '/agenda';
export async function criarAgendamento(_prev: AgendaFormState, fd: FormData): Promise<AgendaFormState> {
  const actor = await requireMaster(); const dados = lerDadosAgendamento(fd); if ('error' in dados) return dados;
  try { const id = await createAgendamento(dados); await audit({ actorId: actor.id, action: 'create', entityType: 'agendamento', entityId: id }); revalidatePath(ROTA); return { ok: 'Agendamento criado.' }; }
  catch (err) { if (err instanceof ConflitoHorarioError) return { error: err.message }; throw err; }
}
export async function salvarAgendamento(_prev: AgendaFormState, fd: FormData): Promise<AgendaFormState> {
  const actor = await requireMaster(); const id = String(fd.get('id') ?? ''); if (!isUuid(id)) return { error: 'Agendamento não encontrado.' }; const dados = lerDadosAgendamento(fd); if ('error' in dados) return dados;
  try { await updateAgendamento(id, dados); await audit({ actorId: actor.id, action: 'update', entityType: 'agendamento', entityId: id }); revalidatePath(ROTA); return { ok: 'Agendamento atualizado.' }; }
  catch (err) { if (err instanceof ConflitoHorarioError) return { error: err.message }; throw err; }
}
export async function apagarAgendamento(id: string): Promise<{ error?: string }> {
  const actor = await requireMaster(); if (!isUuid(id)) return { error: 'Agendamento não encontrado.' }; await softDeleteAgendamento(id); await audit({ actorId: actor.id, action: 'delete', entityType: 'agendamento', entityId: id }); revalidatePath(ROTA); return {};
}
export async function moverAgendamento(id: string, data: string, horaInicio: string, horaFim: string): Promise<{ error?: string }> {
  const actor = await requireMaster(); if (!isUuid(id)) return { error: 'Agendamento não encontrado.' };
  try { await moverOuRedimensionar(id, data, horaInicio, horaFim); await audit({ actorId: actor.id, action: 'update', entityType: 'agendamento', entityId: id }); revalidatePath(ROTA); return {}; }
  catch (err) { if (err instanceof ConflitoHorarioError) return { error: err.message }; throw err; }
}
