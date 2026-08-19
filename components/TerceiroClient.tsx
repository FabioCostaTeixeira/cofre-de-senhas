'use client';

import { Plus } from 'lucide-react';
import { Fragment, useActionState, useEffect, useState } from 'react';
import { ModalForm } from '@/components/ModalForm';
import { mascararTelefone, soDigitos } from '@/lib/documentos';
import { formatarDataHora } from '@/lib/formato';
import type { Agendamento, ContratacaoDoCliente, StatusAgendamento, Terceiro, TipoContratacao } from '@/lib/types';

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

const ROTULOS_TIPO: Record<TipoContratacao, string> = {
  avulso: 'Avulso', combo: 'Combo', plano: 'Plano',
};

const ROTULOS_STATUS_AGENDAMENTO: Record<StatusAgendamento, string> = {
  agendado: 'Agendado', pre_agendado: 'Pré-agendado', gravando: 'Gravando',
  concluido: 'Concluído', cancelado: 'Cancelado',
};

const inicial: TerceiroState = {};

type Acao = (prev: TerceiroState, fd: FormData) => Promise<TerceiroState>;

export function TerceiroClient({
  tipo, itens, criar, salvar, apagar, buscarDadosCliente,
}: {
  tipo: 'cliente' | 'fornecedor';
  itens: Terceiro[];
  criar: Acao;
  salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
  buscarDadosCliente?: (clienteId: string) => Promise<DadosHistoricoCliente | { error: string }>;
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
          onFechar={() => setAberto(null)} buscarDadosCliente={buscarDadosCliente}
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
    <div className="grid gap-4 sm:grid-cols-3">
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
      submitLabel="Cadastrar" maxWidth="2xl"
    >
      <CamposComuns telefoneDigitos={telefoneDigitos} onTelefone={setTelefoneDigitos} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
    </ModalForm>
  );
}

function AbaCompras({ contratacoes }: { contratacoes: ContratacaoDoCliente[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);

  if (contratacoes.length === 0) {
    return <p className="text-sm py-4" style={{ color: 'var(--text-dim)' }}>Nenhuma contratação.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ color: 'var(--text-dim)' }}>
          <th className="text-left p-2">Tipo</th>
          <th className="text-left p-2">Item</th>
          <th className="text-left p-2">Qtd</th>
          <th className="text-left p-2">Total</th>
          <th className="text-left p-2">Data</th>
          <th className="text-left p-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {contratacoes.map((c) => (
          <Fragment key={c.id}>
            <tr className="cursor-pointer" onClick={() => setExpandido(expandido === c.id ? null : c.id)}>
              <td className="p-2">{ROTULOS_TIPO[c.tipo]}</td>
              <td className="p-2">{c.item_nome}</td>
              <td className="p-2">{c.quantidade}</td>
              <td className="p-2">R$ {c.preco_total.toFixed(2)}</td>
              <td className="p-2">
                {c.created_at.slice(8, 10)}/{c.created_at.slice(5, 7)}/{c.created_at.slice(0, 4)}
              </td>
              <td className="p-2">{c.cancelada ? 'Cancelada' : 'Ativa'}</td>
            </tr>
            {expandido === c.id && c.itens.length > 0 && (
              <tr>
                <td colSpan={6} className="p-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: 'var(--text-dim)' }}>
                        <th className="text-left p-1">Produto</th>
                        <th className="text-left p-1">Total</th>
                        <th className="text-left p-1">Consumido</th>
                        <th className="text-left p-1">Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.itens.map((i) => (
                        <tr key={i.produto_id}>
                          <td className="p-1">{i.produto_nome}</td>
                          <td className="p-1">{i.quantidade_total}</td>
                          <td className="p-1">{i.quantidade_consumida}</td>
                          <td className="p-1">{i.quantidade_total - i.quantidade_consumida}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function AbaAgendamento({ agendamentos }: { agendamentos: Agendamento[] }) {
  if (agendamentos.length === 0) {
    return <p className="text-sm py-4" style={{ color: 'var(--text-dim)' }}>Nenhum agendamento.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ color: 'var(--text-dim)' }}>
          <th className="text-left p-2">Produto</th>
          <th className="text-left p-2">Studio</th>
          <th className="text-left p-2">Data</th>
          <th className="text-left p-2">Início</th>
          <th className="text-left p-2">Fim</th>
          <th className="text-left p-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {agendamentos.map((a) => (
          <tr key={a.id}>
            <td className="p-2">{a.categoria_nome}</td>
            <td className="p-2">{a.estudio_nome}</td>
            <td className="p-2">{a.data.slice(8, 10)}/{a.data.slice(5, 7)}/{a.data.slice(0, 4)}</td>
            <td className="p-2">{a.hora_inicio.slice(0, 5)}</td>
            <td className="p-2">{a.hora_fim.slice(0, 5)}</td>
            <td className="p-2">{ROTULOS_STATUS_AGENDAMENTO[a.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type DadosHistoricoCliente = { contratacoes: ContratacaoDoCliente[]; agendamentos: Agendamento[] };

function HistoricoCliente({
  clienteId, buscarDadosCliente,
}: {
  clienteId: string;
  buscarDadosCliente: (clienteId: string) => Promise<DadosHistoricoCliente | { error: string }>;
}) {
  const [aba, setAba] = useState<'compras' | 'agendamento'>('compras');
  const [dados, setDados] = useState<DadosHistoricoCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDados(null);
    setErro(null);
    void buscarDadosCliente(clienteId).then((r) => {
      if (cancelado) return;
      if ('error' in r) setErro(r.error);
      else setDados(r);
    });
    return () => {
      cancelado = true;
    };
  }, [clienteId, buscarDadosCliente]);

  return (
    <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex gap-2">
        <button
          type="button"
          className={aba === 'compras' ? 'btn btn-primary' : 'btn'}
          onClick={() => setAba('compras')}
        >
          Compras
        </button>
        <button
          type="button"
          className={aba === 'agendamento' ? 'btn btn-primary' : 'btn'}
          onClick={() => setAba('agendamento')}
        >
          Agendamento
        </button>
      </div>

      {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
      {!erro && !dados && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Carregando...</p>}
      {dados && aba === 'compras' && <AbaCompras contratacoes={dados.contratacoes} />}
      {dados && aba === 'agendamento' && <AbaAgendamento agendamentos={dados.agendamentos} />}
    </div>
  );
}

function ModalEdicao({
  item, rotulos, salvar, apagar, onFechar, buscarDadosCliente,
}: {
  item: Terceiro;
  rotulos: (typeof ROTULOS)[keyof typeof ROTULOS];
  salvar: Acao;
  apagar: (id: string) => Promise<{ error?: string }>;
  onFechar: () => void;
  buscarDadosCliente?: (clienteId: string) => Promise<DadosHistoricoCliente | { error: string }>;
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
      submitLabel="Salvar" maxWidth="2xl"
    >
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        Cadastrado em {formatarDataHora(item.created_at)}
      </p>
      <input type="hidden" name="id" value={item.id} />
      <CamposComuns item={item} telefoneDigitos={telefoneDigitos} onTelefone={setTelefoneDigitos} />
      {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      <button type="button" className="btn btn-danger" onClick={() => void apagarClique()}>Apagar</button>
      {erroApagar && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erroApagar}</p>}
      {buscarDadosCliente && (
        <HistoricoCliente clienteId={item.id} buscarDadosCliente={buscarDadosCliente} />
      )}
    </ModalForm>
  );
}
