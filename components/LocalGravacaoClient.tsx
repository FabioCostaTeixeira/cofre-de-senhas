'use client';

import { Plus } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { EstudiosRepetidor } from '@/components/EstudiosRepetidor';
import { ModalForm } from '@/components/ModalForm';
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

function FormularioNovo({ criar, onClose }: { criar: Acao; onClose: () => void }) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [estudios, setEstudios] = useState<EstudioEntrada[]>([]);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <ModalForm
      title="Novo local de gravação" isOpen onClose={onClose} action={action} isLoading={pending}
      submitLabel="Cadastrar" maxWidth="2xl"
    >
      <CamposComuns estudios={estudios} onEstudios={setEstudios} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
    </ModalForm>
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
    <ModalForm
      title={item.nome} isOpen onClose={onFechar} action={action} isLoading={pending}
      submitLabel="Salvar" maxWidth="2xl"
    >
      <input type="hidden" name="id" value={item.id} />
      <CamposComuns item={item} estudios={estudios} onEstudios={setEstudios} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </ModalForm>
  );
}

export function LocalGravacaoClient({
  itens, criar, salvar, apagar,
}: { itens: LocalGravacao[]; criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }> }) {
  const [aberto, setAberto] = useState<LocalGravacao | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Locais de Gravação</h1>
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
      {novoAberto && <FormularioNovo criar={criar} onClose={() => setNovoAberto(false)} />}

      <button
        type="button"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full p-0 cursor-pointer transition-colors btn-primary"
        onClick={() => setNovoAberto(true)}
        aria-label="Novo local de gravação"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
