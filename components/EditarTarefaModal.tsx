'use client';

import { useActionState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { ModalForm } from '@/components/ModalForm';
import type { Tarefa, User } from '@/lib/types';

export type EditarTarefaState = { error?: string; ok?: boolean };
const inicial: EditarTarefaState = {};
type Acao = (prev: EditarTarefaState, fd: FormData) => Promise<EditarTarefaState>;

/** O driver pode entregar `Date` mesmo com `::text` (ver TarefaCard) — o input date quer `YYYY-MM-DD`. */
function paraInputData(valor: string | Date | null): string {
  if (!valor) return '';
  return (valor instanceof Date ? valor.toISOString() : valor).slice(0, 10);
}

/**
 * Edição do card do Planejamento. Só montado com o modal aberto, então reabrir
 * começa com o `useActionState` limpo. Cliente e produto aparecem só para leitura:
 * estão presos à OS e ao saldo da contratação. `onExcluir` mostra o botão de excluir
 * (só gestor/master chegam a abrir este modal); a confirmação fica com quem chamou.
 */
export function EditarTarefaModal({
  tarefa, users, salvar, onFechar, onExcluir,
}: { tarefa: Tarefa; users: User[]; salvar: Acao; onFechar: () => void; onExcluir?: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);

  useEffect(() => { if (state.ok) onFechar(); }, [state.ok, onFechar]);

  // Usuário desativado some da lista, a não ser que já seja o responsável desta tarefa.
  const opcoes = users.filter((u) => u.is_active || u.id === tarefa.responsavel_id);

  return (
    <ModalForm title="Editar tarefa" isOpen onClose={onFechar} action={action} isLoading={pending}>
      <input type="hidden" name="id" value={tarefa.id} />
      <div className="text-sm space-y-1">
        <p><span style={{ color: 'var(--text-dim)' }}>Cliente: </span>{tarefa.cliente_nome}</p>
        <p><span style={{ color: 'var(--text-dim)' }}>Produto: </span>{tarefa.produto_nome}</p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm">Responsável</span>
        <select name="responsavelId" className="input" defaultValue={tarefa.responsavel_id ?? ''}>
          <option value="">Sem responsável</option>
          {opcoes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Tarefa</span>
        <textarea name="tarefa" className="input" rows={3} defaultValue={tarefa.tarefa ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Deadline cliente</span>
        <input type="date" name="deadlineCliente" className="input" defaultValue={paraInputData(tarefa.deadline_cliente)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Deadline tarefa</span>
        <input type="date" name="deadlineTarefa" className="input" defaultValue={paraInputData(tarefa.deadline_tarefa)} />
      </label>
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      {onExcluir && (
        <button
          type="button" onClick={onExcluir} disabled={pending}
          className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg hover:bg-white/10 transition"
          style={{ color: 'var(--danger)' }}
        >
          <Trash2 size={14} /> Excluir tarefa
        </button>
      )}
    </ModalForm>
  );
}
