# Modal de Cliente — Layout Mais Largo + Abas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modal de cliente mais largo (2 linhas de campos) e com abas de histórico
(Compras e Agendamento), carregadas sob demanda ao abrir o modal de edição.

**Architecture:** Duas novas queries de leitura (`lib/db/contratacoes.ts`,
`lib/db/agenda.ts`, mesmo padrão join das queries irmãs já existentes), uma nova Server
Action que as chama em paralelo (`app/(app)/cadastros/clientes/actions.ts`, chamada
direto de um `useEffect`, não via `useActionState`), e mudanças de UI em
`components/TerceiroClient.tsx` (grid mais largo pra ambos os tipos, abas só para
cliente).

**Tech Stack:** Next.js 15 (Server Actions, React 19), TypeScript, `@neondatabase/serverless`.

## Global Constraints

- Abas só aparecem no modal de **edição**, só para `tipo === 'cliente'` — Fornecedores
  herda o layout mais largo mas não ganha abas.
- Compras e Agendamento mostram **histórico completo, inclusive cancelados** — diferente
  do padrão de soft-delete-esconde do resto do sistema, decisão explícita do cliente.
  "Cancelado" em contratação = `deleted_at is not null`. "Cancelado" em agendamento =
  `status = 'cancelado'` (registro continua existindo, `deleted_at is null`). Um
  agendamento de fato apagado (`deleted_at is not null`) continua excluído nas duas
  abas — isso não muda.
- Nenhuma mudança de schema de banco.
- Este modal é só leitura de histórico — nenhuma ação de editar/cancelar contratação ou
  agendamento a partir daqui.

---

### Task 1: Queries de histórico do cliente

Duas novas funções de leitura, cada uma espelhando o `select`/`join` de uma query irmã
já existente, só trocando o filtro.

**Files:**
- Modify: `lib/types.ts` — adiciona `ContratacaoDoCliente`
- Modify: `lib/db/contratacoes.ts` — adiciona `listContratacoesDoCliente`
- Modify: `lib/db/agenda.ts` — adiciona `listAgendamentosDoCliente`

**Interfaces:**
- Consumes: `sql` de `@/lib/db/client`; tipos `Contratacao`, `Agendamento` já existentes
- Produces:
  - `type ContratacaoDoCliente = Contratacao & { cancelada: boolean }`
  - `function listContratacoesDoCliente(clienteId: string): Promise<ContratacaoDoCliente[]>`
  - `function listAgendamentosDoCliente(clienteId: string): Promise<Agendamento[]>`

- [ ] **Step 1:** Em `lib/types.ts`, adiciona logo depois do `type Contratacao = {...}`
  existente:

```typescript
/** Mesma forma de `Contratacao`, mais `cancelada` — só usado na visão de histórico por
 *  cliente (`listContratacoesDoCliente`), que não filtra `deleted_at`. */
export type ContratacaoDoCliente = Contratacao & { cancelada: boolean };
```

- [ ] **Step 2:** Em `lib/db/contratacoes.ts`, adiciona `listContratacoesDoCliente` logo
  depois de `listContratacoes` (mesma query, filtro trocado, sem o `where deleted_at is
  null`, adiciona a coluna `cancelada`):

```typescript
/**
 * Histórico completo de um cliente, inclusive contratações canceladas (`cancelada:
 * true` quando `deleted_at` não é nulo) — diferente de `listContratacoes`, que só
 * mostra ativas. Usado no modal de cliente (aba Compras), não na lista principal.
 */
export async function listContratacoesDoCliente(clienteId: string): Promise<ContratacaoDoCliente[]> {
  assertUuid(clienteId);
  return (await sql`
    select ct.id, ct.cliente_id, cl.nome as cliente_nome, ct.tipo,
           ct.produto_id, ct.combo_id, ct.plano_id,
           coalesce(p.nome, c.nome, pl.nome) as item_nome,
           ct.quantidade, ct.preco_total::float8 as preco_total,
           ct.data_validade::text as data_validade,
           ct.created_at,
           (ct.deleted_at is not null) as cancelada,
           coalesce(
             json_agg(
               json_build_object(
                 'produto_id', ci.produto_id, 'produto_nome', cp.nome,
                 'quantidade_total', ci.quantidade_total, 'quantidade_consumida', ci.quantidade_consumida
               ) order by cp.nome
             ) filter (where ci.id is not null), '[]'
           ) as itens
      from contratacoes ct
      join clientes cl on cl.id = ct.cliente_id
      left join produtos p on p.id = ct.produto_id
      left join combos c on c.id = ct.combo_id
      left join planos pl on pl.id = ct.plano_id
      left join contratacao_itens ci on ci.contratacao_id = ct.id
      left join produtos cp on cp.id = ci.produto_id
     where ct.cliente_id = ${clienteId}
     group by ct.id, cl.nome, p.nome, c.nome, pl.nome
     order by ct.created_at desc`) as ContratacaoDoCliente[];
}
```

Import `ContratacaoDoCliente` no topo do arquivo (junto do `import type { Contratacao,
DadosContratacao } from '@/lib/types';` já existente).

- [ ] **Step 3:** Em `lib/db/agenda.ts`, adiciona `listAgendamentosDoCliente` logo
  depois de `listAgendamentosDoEstudio` (mesma query, filtro trocado, sem filtro de
  `status`, ordenado do mais recente pro mais antigo):

```typescript
/**
 * Histórico completo de agendamentos de um cliente, em todos os studios, inclusive
 * `status = 'cancelado'` (cancelado é um status, não uma exclusão — o registro
 * continua existindo). Só exclui de fato apagados (`deleted_at`). Usado no modal de
 * cliente (aba Agendamento).
 */
export async function listAgendamentosDoCliente(clienteId: string): Promise<Agendamento[]> {
  assertUuid(clienteId);
  return (await sql`
    select a.id, a.cliente_id, cl.nome as cliente_nome, a.local_id, a.estudio_id, e.nome as estudio_nome,
           a.categoria_produto_id, cp.nome as categoria_nome, a.status,
           a.data::text as data, a.hora_inicio::text as hora_inicio, a.hora_fim::text as hora_fim,
           a.created_at
      from agendamentos a
      join clientes cl on cl.id = a.cliente_id
      join estudios e on e.id = a.estudio_id
      join categorias_produto cp on cp.id = a.categoria_produto_id
     where a.cliente_id = ${clienteId} and a.deleted_at is null
     order by a.data desc, a.hora_inicio desc`) as Agendamento[];
}
```

- [ ] **Step 4:** Roda `tsc` e a suíte inteira, confirma que compila e nada quebrou

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 5:** Commit

```bash
git add lib/types.ts lib/db/contratacoes.ts lib/db/agenda.ts
git commit -m "Adiciona queries de histórico de contratações e agendamentos por cliente"
```

---

### Task 2: Server Action + UI (modal mais largo, grid 3 colunas, abas Compras/Agendamento)

Uma função de busca (chamada direto do client, não via `useActionState`/form — não é
submissão de formulário) mais toda a UI que a consome. Fica numa task só porque não dá
pra fechar o tipo de `buscarDadosCliente` sem o consumidor existir: se a prop fosse
adicionada num commit e o componente que a usa só no próximo, o `tsc` ficaria quebrado
entre os dois commits — mesmo motivo pelo qual o plano do Dashboard juntou a troca de
rota com a criação da nova home numa única task.

**Files:**
- Modify: `app/(app)/cadastros/clientes/actions.ts` — adiciona `buscarDadosClienteAction`
- Modify: `app/(app)/cadastros/clientes/page.tsx` — passa a nova action pra `TerceiroClient`
- Modify: `components/TerceiroClient.tsx`
- Modify: `tests/TerceiroClient.test.tsx`

**Interfaces:**
- Consumes: `listContratacoesDoCliente`, `listAgendamentosDoCliente` (Task 1);
  `requireMaster` de `@/lib/auth/guards`; `isUuid` de `@/lib/validation`; tipos
  `ContratacaoDoCliente`, `Agendamento`, `TipoContratacao`, `StatusAgendamento` de
  `@/lib/types`
- Produces:
  - `function buscarDadosClienteAction(clienteId: string): Promise<{ contratacoes: ContratacaoDoCliente[]; agendamentos: Agendamento[] } | { error: string }>`
  - `TerceiroClient` com prop nova opcional `buscarDadosCliente`

- [ ] **Step 1:** Em `app/(app)/cadastros/clientes/actions.ts`, adiciona o import das
  novas queries e dos tipos, e a nova função no final do arquivo:

```typescript
import { listContratacoesDoCliente } from '@/lib/db/contratacoes';
import { listAgendamentosDoCliente } from '@/lib/db/agenda';
import type { Agendamento, ContratacaoDoCliente } from '@/lib/types';
```

(adiciona junto dos imports já existentes no topo do arquivo)

```typescript
/**
 * Busca o histórico de compras e agendamentos de um cliente, chamada direto do
 * cliente (não é submissão de formulário, então não passa por `useActionState`).
 * Mesmo guard de leitura da página (`requireMaster`) — quem vê a lista de clientes
 * pode ver o histórico de qualquer um deles.
 */
export async function buscarDadosClienteAction(
  clienteId: string,
): Promise<{ contratacoes: ContratacaoDoCliente[]; agendamentos: Agendamento[] } | { error: string }> {
  await requireMaster();
  if (!isUuid(clienteId)) return { error: 'Cliente não encontrado.' };

  const [contratacoes, agendamentos] = await Promise.all([
    listContratacoesDoCliente(clienteId),
    listAgendamentosDoCliente(clienteId),
  ]);
  return { contratacoes, agendamentos };
}
```

- [ ] **Step 2:** Em `app/(app)/cadastros/clientes/page.tsx`, importa e passa a nova
  action:

```typescript
import { apagarCliente, buscarDadosClienteAction, criarCliente, salvarCliente } from './actions';
```

(troca a linha de import existente por essa, que adiciona `buscarDadosClienteAction`)

```typescript
<TerceiroClient
  tipo="cliente" itens={itens}
  criar={criarCliente} salvar={salvarCliente} apagar={apagarCliente}
  buscarDadosCliente={buscarDadosClienteAction}
/>
```

(adiciona a prop `buscarDadosCliente` na chamada de `TerceiroClient` já existente)

**Nota:** `app/(app)/cadastros/fornecedores/page.tsx` não muda — não passa
`buscarDadosCliente`, então `TerceiroClient` não mostra abas pra fornecedor.

- [ ] **Step 3:** Adiciona imports no topo de `components/TerceiroClient.tsx` (junto
  dos já existentes):

```typescript
import { Fragment, useActionState, useEffect, useState } from 'react';
```

(troca a linha de import de `react` existente, que já tem `useActionState, useEffect,
useState`, adicionando `Fragment`)

```typescript
import type { Agendamento, ContratacaoDoCliente, StatusAgendamento, Terceiro, TipoContratacao } from '@/lib/types';
```

(troca `import type { Terceiro } from '@/lib/types';` por essa)

- [ ] **Step 4:** Adiciona os rótulos de tipo/status logo depois da constante `ROTULOS`
  já existente:

```typescript
const ROTULOS_TIPO: Record<TipoContratacao, string> = {
  avulso: 'Avulso', combo: 'Combo', plano: 'Plano',
};

const ROTULOS_STATUS_AGENDAMENTO: Record<StatusAgendamento, string> = {
  agendado: 'Agendado', pre_agendado: 'Pré-agendado', gravando: 'Gravando',
  concluido: 'Concluído', cancelado: 'Cancelado',
};
```

- [ ] **Step 5:** Troca o grid de `CamposComuns` de 2 pra 3 colunas — na função
  `CamposComuns`, o `<div className="grid gap-4 sm:grid-cols-2">` vira
  `<div className="grid gap-4 sm:grid-cols-3">` (só essa classe muda, resto da função
  igual).

- [ ] **Step 6:** Adiciona `maxWidth="2xl"` no `<ModalForm>` de `FormularioNovo` (a
  chamada já existente `<ModalForm title={rotulos.novo} isOpen onClose={onClose}
  action={action} isLoading={pending} submitLabel="Cadastrar">` ganha `maxWidth="2xl"`
  depois de `submitLabel="Cadastrar"`).

- [ ] **Step 7:** Adiciona os dois componentes de aba, antes da função `ModalEdicao`:

```typescript
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
```

- [ ] **Step 8:** Atualiza a assinatura de `ModalEdicao` pra receber e usar
  `buscarDadosCliente` (opcional — só existe quando `tipo === 'cliente'`), e adiciona
  `maxWidth="2xl"` no `ModalForm` dela também:

```typescript
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
```

(troca a assinatura de `ModalEdicao` já existente por essa)

Dentro do JSX de retorno de `ModalEdicao`, o `<ModalForm title={item.nome} isOpen
onClose={onFechar} action={action} isLoading={pending} submitLabel="Salvar">` ganha
`maxWidth="2xl"`, e logo depois do bloco `{erroApagar && ...}` (mas ainda dentro do
`<ModalForm>`, como último filho antes de fechar a tag), adiciona:

```typescript
      {buscarDadosCliente && (
        <HistoricoCliente clienteId={item.id} buscarDadosCliente={buscarDadosCliente} />
      )}
```

- [ ] **Step 9:** Atualiza a assinatura de `TerceiroClient` (componente exportado) pra
  aceitar e repassar `buscarDadosCliente`:

```typescript
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
```

(troca a assinatura já existente por essa)

No JSX, a chamada de `<ModalEdicao key={aberto.id} item={aberto} rotulos={rotulos}
salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />` ganha
`buscarDadosCliente={buscarDadosCliente}` como prop adicional.

- [ ] **Step 10:** Roda `tsc`, confirma que compila sem erros

```bash
npx tsc --noEmit
```

- [ ] **Step 11:** Atualiza `tests/TerceiroClient.test.tsx` — adiciona ao final do
  arquivo (dentro do `describe('TerceiroClient', ...)` já existente, antes do último
  `});`):

```typescript
  it('modal de cliente mostra as abas Compras e Agendamento', async () => {
    const buscarDadosCliente = vi.fn().mockResolvedValue({
      contratacoes: [], agendamentos: [],
    });
    render(
      <TerceiroClient
        tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar}
        buscarDadosCliente={buscarDadosCliente}
      />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(screen.getByRole('button', { name: 'Compras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agendamento' })).toBeInTheDocument();
    expect(buscarDadosCliente).toHaveBeenCalledWith(item.id);
  });

  it('modal de fornecedor não mostra abas', () => {
    render(
      <TerceiroClient tipo="fornecedor" itens={[item]} criar={criar} salvar={salvar} apagar={apagar} />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(screen.queryByRole('button', { name: 'Compras' })).not.toBeInTheDocument();
  });

  it('troca de aba mostra o conteúdo certo', async () => {
    const buscarDadosCliente = vi.fn().mockResolvedValue({
      contratacoes: [{
        id: 'ct1', cliente_id: item.id, cliente_nome: item.nome, tipo: 'avulso',
        produto_id: 'p1', combo_id: null, plano_id: null, item_nome: 'Gravação Padrão',
        quantidade: 1, preco_total: 100, data_validade: null, created_at: '2026-08-01T00:00:00Z',
        cancelada: false, itens: [],
      }],
      agendamentos: [{
        id: 'ag1', cliente_id: item.id, cliente_nome: item.nome, local_id: 'l1',
        estudio_id: 'e1', estudio_nome: 'Estúdio A', categoria_produto_id: 'cat1',
        categoria_nome: 'Gravação Padrão', status: 'concluido', data: '2026-08-01',
        hora_inicio: '09:00:00', hora_fim: '10:00:00', created_at: '2026-08-01T00:00:00Z',
      }],
    });
    render(
      <TerceiroClient
        tipo="cliente" itens={[item]} criar={criar} salvar={salvar} apagar={apagar}
        buscarDadosCliente={buscarDadosCliente}
      />,
    );
    fireEvent.click(screen.getByText('ACME Ltda'));
    expect(await screen.findByText('Gravação Padrão')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agendamento' }));
    expect(await screen.findByText('Estúdio A')).toBeInTheDocument();
  });
```

- [ ] **Step 12:** Roda os testes deste arquivo, confirma que passam

```bash
npx vitest run tests/TerceiroClient.test.tsx
```

- [ ] **Step 13:** Roda `tsc` e a suíte inteira

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 14:** Verificação manual

```bash
npm run dev
```

No navegador, logado como master: `/cadastros/clientes` → clica num cliente com
contratações e agendamentos reais → confere que o modal está mais largo (2 linhas de
campos), as abas aparecem, os dados batem com `/contratacoes` e `/agenda` filtrados
por aquele cliente, incluindo itens cancelados. Depois `/cadastros/fornecedores` →
confere que o modal está mais largo mas sem abas.

- [ ] **Step 15:** Commit

```bash
git add "app/(app)/cadastros/clientes/actions.ts" "app/(app)/cadastros/clientes/page.tsx" \
  components/TerceiroClient.tsx tests/TerceiroClient.test.tsx
git commit -m "Modal de cliente mais largo com abas de Compras e Agendamento"
```

---

## Testing

```bash
npx tsc --noEmit
npx vitest run
```

Manual: login master → `/cadastros/clientes` → abre um cliente com histórico real →
confere layout e dados das duas abas → `/cadastros/fornecedores` → confere que não tem
abas mas o modal está mais largo.
