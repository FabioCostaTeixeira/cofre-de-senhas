'use client';

import { useActionState, useEffect, useState } from 'react';
import type { Agendamento, CategoriaProduto, LocalGravacao, StatusAgendamento, Terceiro } from '@/lib/types';

export type AgendaFormState = { error?: string; ok?: string };
const inicial: AgendaFormState = {};
type Acao = (prev: AgendaFormState, fd: FormData) => Promise<AgendaFormState>;

const STATUS_OPCOES: { valor: StatusAgendamento; rotulo: string }[] = [
  { valor: 'pre_agendado', rotulo: 'Pré Agendado' }, { valor: 'agendado', rotulo: 'Agendado' },
  { valor: 'gravando', rotulo: 'Gravando' }, { valor: 'concluido', rotulo: 'Concluído' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
];

export function AgendaFormularioModal({
  item, padraoData, padraoHoraInicio, padraoHoraFim, padraoLocalId, padraoEstudioId, clientes, locais, categorias, criar, salvar, apagar, onFechar,
}: {
  item?: Agendamento; padraoData?: string; padraoHoraInicio?: string; padraoHoraFim?: string;
  padraoLocalId?: string; padraoEstudioId?: string;
  clientes: Terceiro[]; locais: LocalGravacao[]; categorias: CategoriaProduto[];
  criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(item ? salvar : criar, inicial);
  const [localId, setLocalId] = useState(item?.local_id ?? padraoLocalId ?? locais[0]?.id ?? '');
  const [erroApagar, setErroApagar] = useState<string | null>(null);
  const localAtual = locais.find((l) => l.id === localId);

  useEffect(() => { if (state.ok) onFechar(); }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!item || !confirm('Apagar este agendamento?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error); else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item ? 'Editar agendamento' : 'Novo agendamento'}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        {item && <input type="hidden" name="id" value={item.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1"><span className="text-sm">Cliente</span>
            <select name="clienteId" className="input" defaultValue={item?.cliente_id ?? ''} required>
              <option value="" disabled>Escolha…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="text-sm">Local de gravação</span>
            <select aria-label="Local de gravação" name="localId" className="input" value={localId} onChange={(e) => setLocalId(e.target.value)}>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="text-sm">Estúdio</span>
            <select name="estudioId" className="input" defaultValue={item?.estudio_id ?? padraoEstudioId ?? ''} required>
              <option value="" disabled>Escolha…</option>{(localAtual?.estudios ?? []).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="text-sm">Tipo de gravação</span>
            <select name="categoriaId" className="input" defaultValue={item?.categoria_produto_id ?? ''} required>
              <option value="" disabled>Escolha…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="text-sm">Status</span>
            <select name="status" className="input" defaultValue={item?.status ?? 'pre_agendado'}>{STATUS_OPCOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select>
          </label>
          <label className="block space-y-1"><span className="text-sm">Data</span><input type="date" name="data" className="input" defaultValue={item?.data ?? padraoData ?? ''} required /></label>
          <label className="block space-y-1"><span className="text-sm">Início</span><input type="time" step={1800} min="07:00" max="21:00" name="horaInicio" className="input" defaultValue={item?.hora_inicio.slice(0, 5) ?? padraoHoraInicio ?? ''} required /></label>
          <label className="block space-y-1"><span className="text-sm">Fim</span><input type="time" step={1800} min="07:00" max="21:00" name="horaFim" className="input" defaultValue={item?.hora_fim.slice(0, 5) ?? padraoHoraFim ?? ''} required /></label>
        </div>
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>{item ? 'Salvar' : 'Cadastrar'}</button>
      </form>
      {item && <><button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>{erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}</>}
    </div>
  );
}
