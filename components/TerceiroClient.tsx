'use client';

import { Plus } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { mascararTelefone, soDigitos } from '@/lib/documentos';
import { formatarDataHora } from '@/lib/formato';
import type { Terceiro } from '@/lib/types';

export type TerceiroState = { error?: string; ok?: string };

const ROTULOS = {
  cliente: {
    titulo: 'Clientes', novo: 'Novo cliente', vazio: 'Nenhum cliente cadastrado.',
    confirmarApagar: 'Apagar este cliente?',
  },
  fornecedor: {
    titulo: 'Fornecedores', novo: 'Novo fornecedor', vazio: 'Nenhum fornecedor cadastrado.',
    confirmarApagar: 'Apagar este fornecedor?',
  },
} as const;

const inicial: TerceiroState = {};

type Acao = (prev: TerceiroState, fd: FormData) => Promise<TerceiroState>;

export function TerceiroClient({
  tipo, itens, criar, salvar, apagar,
}: {
  tipo: 'cliente' | 'fornecedor';
  itens: Terceiro[];
  criar: Acao;
  salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
}) {
  const rotulos = ROTULOS[tipo];
  const [aberto, setAberto] = useState<Terceiro | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{rotulos.titulo}</h1>

      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Contato responsável</th>
            <th className="text-left p-2">E-mail</th>
            <th className="text-left p-2">Telefone</th>
            <th className="text-left p-2">Cidade/UF</th>
            <th className="text-left p-2">Criado em</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => setAberto(t)}>
              <td className="p-2">{t.nome}</td>
              <td className="p-2">{t.contato_responsavel ?? '—'}</td>
              <td className="p-2">{t.email ?? '—'}</td>
              <td className="p-2">{t.telefone ? mascararTelefone(t.telefone) : '—'}</td>
              <td className="p-2">{[t.cidade, t.uf].filter(Boolean).join('/') || '—'}</td>
              <td className="p-2">{formatarDataHora(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{rotulos.vazio}</p>
      )}

      {aberto && (
        <ModalEdicao
          key={aberto.id} item={aberto} rotulos={rotulos} salvar={salvar} apagar={apagar}
          onFechar={() => setAberto(null)}
        />
      )}
      {novoAberto && (
        <FormularioNovo rotulos={rotulos} criar={criar} onClose={() => setNovoAberto(false)} />
      )}

      <button
        type="button"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full p-0 cursor-pointer transition-colors btn-primary"
        onClick={() => setNovoAberto(true)}
        aria-label={rotulos.novo}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

function CamposComuns({
  item, telefoneDigitos, onTelefone,
}: {
  item?: Terceiro;
  telefoneDigitos: string;
  onTelefone: (digitos: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-sm">Nome completo</span>
        <input name="nome" className="input" defaultValue={item?.nome ?? ''} required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Contato responsável</span>
        <input name="contatoResponsavel" className="input" defaultValue={item?.contato_responsavel ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">E-mail</span>
        <input name="email" type="email" className="input" defaultValue={item?.email ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Telefone</span>
        <input name="telefone" className="input" inputMode="numeric" maxLength={15}
               value={mascararTelefone(telefoneDigitos)}
               onChange={(e) => onTelefone(soDigitos(e.target.value))} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Cidade</span>
        <input name="cidade" className="input" defaultValue={item?.cidade ?? ''} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Estado (UF)</span>
        <input name="uf" className="input" maxLength={2} defaultValue={item?.uf ?? ''}
               style={{ textTransform: 'uppercase' }} />
      </label>
    </div>
  );
}

function FormularioNovo({
  rotulos, criar, onClose,
}: {
  rotulos: (typeof ROTULOS)[keyof typeof ROTULOS];
  criar: Acao;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(criar, inicial);
  const [telefoneDigitos, setTelefoneDigitos] = useState('');

  // Sucesso: fecha o modal sozinho, mesmo padrão dos outros ModalForm de criação.
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <ModalForm
      title={rotulos.novo} isOpen onClose={onClose} action={action} isLoading={pending}
      submitLabel="Cadastrar"
    >
      <CamposComuns telefoneDigitos={telefoneDigitos} onTelefone={setTelefoneDigitos} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
    </ModalForm>
  );
}

function ModalEdicao({
  item, rotulos, salvar, apagar, onFechar,
}: {
  item: Terceiro;
  rotulos: (typeof ROTULOS)[keyof typeof ROTULOS];
  salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
  onFechar: () => void;
}) {
  const [state, action, pending] = useActionState(salvar, inicial);
  const [telefoneDigitos, setTelefoneDigitos] = useState(item.telefone ?? '');
  const [erroApagar, setErroApagar] = useState<string | null>(null);

  // Salvou com sucesso: fecha o modal sozinho, mesmo padrão do modal de usuário.
  useEffect(() => {
    if (state.ok) onFechar();
  }, [state.ok, onFechar]);

  async function apagarClique() {
    if (!confirm(rotulos.confirmarApagar)) return;
    const r = await apagar(item.id);
    if (r.error) setErroApagar(r.error);
    else onFechar();
  }

  return (
    <ModalForm
      title={item.nome} isOpen onClose={onFechar} action={action} isLoading={pending}
      submitLabel="Salvar"
    >
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        Cadastrado em {formatarDataHora(item.created_at)}
      </p>
      <input type="hidden" name="id" value={item.id} />
      <CamposComuns item={item} telefoneDigitos={telefoneDigitos} onTelefone={setTelefoneDigitos} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
    </ModalForm>
  );
}
