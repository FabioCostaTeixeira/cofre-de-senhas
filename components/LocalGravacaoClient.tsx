'use client';

import { useActionState, useEffect, useState } from 'react';
import { EstudiosRepetidor } from '@/components/EstudiosRepetidor';
import type { DadosLocal, LocalGravacao } from '@/lib/types';

export type LocalGravacaoState = { error?: string; ok?: string };
const inicial: LocalGravacaoState = {};
type Acao = (prev: LocalGravacaoState, fd: FormData) => Promise<LocalGravacaoState>;
type EstudioEntrada = DadosLocal['estudios'][number];

function CamposComuns({
  item, estudios, onEstudios,
}: { item?: LocalGravacao; estudios: EstudioEntrada[]; onEstudios: (e: EstudioEntrada[]) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm">Nome</span>
          <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Endereço</span>
          <input name="endereco" className="input" defaultValue={item?.endereco ?? ''} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Responsável</span>
          <input name="responsavel" className="input" defaultValue={item?.responsavel ?? ''} />
        </label>
      </div>
      <EstudiosRepetidor itens={estudios} onChange={onEstudios} />
    </>
  );
}

function FormularioNovo({ criar }: { criar: Acao }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [estudios, setEstudios] = useState<EstudioEntrada[]>([]);

  useEffect(() => {
    if (state.ok) setEstudios([]);
  }, [state.ok]);

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo local de gravação</summary>
      <form action={action} className="space-y-4 mt-4">
        <CamposComuns estudios={estudios} onEstudios={setEstudios} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Cadastrar</button>
      </form>
    </details>
  );
}

function ModalEdicao({
  item, salvar, apagar, onFechar,
}: { item: LocalGravacao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; onFechar: () => void }) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [estudios, setEstudios] = useState<EstudioEntrada[]>(
    item.estudios.map((e) => ({ id: e.id, nome: e.nome })),
  );
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm('Apagar este local de gravação?')) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{item.nome}</h2>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={item.id} />
        <CamposComuns item={item} estudios={estudios} onEstudios={setEstudios} />
        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </div>
  );
}

export function LocalGravacaoClient({
  itens, criar, salvar, apagar,
}: { itens: LocalGravacao[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<LocalGravacao | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Locais de Gravação</h1>
      <FormularioNovo criar={criar} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Responsável</th>
            <th className="text-left p-2">Estúdios</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((l) => (
            <tr key={l.id} className="cursor-pointer" onClick={() => setAberto(l)}>
              <td className="p-2">{l.nome}</td>
              <td className="p-2">{l.responsavel ?? '—'}</td>
              <td className="p-2">{l.estudios.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum local de gravação cadastrado.</p>
      )}
      {aberto && (
        <ModalEdicao key={aberto.id} item={aberto} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
