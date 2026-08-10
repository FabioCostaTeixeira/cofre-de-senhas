# Cadastro de Local de Gravação — Design

**Data:** 2026-08-10
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Primeira metade de uma feature maior de **Agenda** (estilo ClickUp, grade semanal com
drag-and-drop, bloqueio de conflito de horário — fora de escopo aqui, spec própria depois). A
Agenda precisa saber onde uma gravação acontece: em qual local físico e em qual estúdio daquele
local. Sem isso cadastrado, não há o que colocar no dropdown de estúdio do card.

**Escopo desta rodada:** cadastro de **Local de Gravação**, cada um com uma lista de **Estúdios**
(salas físicas daquele local). CRUD completo, lixeira, auditoria. Nenhuma lógica de agenda,
horário ou conflito entra aqui.

Hoje a empresa tem 3 locais (P7 Belo Horizonte, 4Nexus Vitória, Externa), cada um com um número
de estúdios que pode crescer — daí ser cadastro, não lista fixa em código.

## 2. Duas entidades, relação 1-N

`locais_gravacao` e `estudios` são tabelas separadas — um local tem N estúdios, um estúdio
pertence a exatamente um local. Diferente do par Clientes/Fornecedores (duas tabelas irmãs, sem
relação entre si), aqui é hierarquia real: apagar um local não faz sentido sem decidir o destino
dos estúdios dele (ver seção 6).

**Por que o estúdio precisa de ID estável desde já:** a próxima spec (Agenda) vai ter
`agendamentos.estudio_id` apontando pra cá. Se o formulário de edição do local recriasse a lista de
estúdios do zero a cada save (apagar tudo, reinserir — o padrão hoje usado pra `combo_itens`), todo
estúdio ganharia um ID novo a cada edição do local, e um agendamento existente apontando pro ID
antigo quebraria. Por isso o update aqui é **diff, não substituição**: ver seção 5.

## 3. Campos

**Local de Gravação** (`locais_gravacao`):

| Campo | Coluna | Obrigatório | Observação |
|---|---|---|---|
| nome | `nome` | sim | ex.: "P7 Belo Horizonte" |
| endereço | `endereco` | não | texto livre |
| responsável | `responsavel` | não | texto livre, nome do responsável no local |
| data de criação | `created_at` | — | automático |

**Estúdio** (`estudios`):

| Campo | Coluna | Obrigatório | Observação |
|---|---|---|---|
| local | `local_id` | sim | FK, definido pelo local em que está sendo editado |
| nome | `nome` | sim | ex.: "Estúdio A" |

## 4. Schema

Migration nova: `db/migrations/007_locais_gravacao.sql`.

```sql
create table locais_gravacao (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  endereco    text,
  responsavel text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table estudios (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references locais_gravacao(id),
  nome        text not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index estudios_local_id_idx on estudios(local_id);
```

Sem `on delete cascade` em `estudios.local_id`: apagar um local não deve apagar estúdio nenhum por
baixo dos panos (mesma filosofia de `combo_itens`/`plano_itens` no módulo Produtos — destrutivo
demais pra ser implícito). A regra de negócio de "o que fazer com os estúdios quando o local é
apagado" fica na camada de dados (seção 6), não no schema.

## 5. Camada de dados

`lib/db/locais-gravacao.ts`:

```ts
export type Estudio = { id: string; local_id: string; nome: string; created_at: string };
export type LocalGravacao = {
  id: string; nome: string; endereco: string | null; responsavel: string | null;
  created_at: string; estudios: Estudio[];
};
export type DadosLocal = {
  nome: string; endereco: string | null; responsavel: string | null;
  /** Estúdios com `id` são renomeados; sem `id`, inseridos. Omitido do array = removido. */
  estudios: { id?: string; nome: string }[];
};

export async function listLocais(): Promise<LocalGravacao[]>
export async function getLocal(id: string): Promise<LocalGravacao | null>
export async function createLocal(dados: DadosLocal): Promise<string>
export async function updateLocal(id: string, dados: DadosLocal): Promise<void>
export async function softDeleteLocal(id: string): Promise<void>
export async function softDeleteEstudio(id: string): Promise<void>
```

`createLocal`/`updateLocal` fazem o diff dos estúdios numa transação (`sql.transaction`, IDs
pré-gerados com `randomUUID()` pros novos — mesmo motivo já documentado no módulo Produtos: a
transação do driver não é interativa):

1. `update estudios set nome = ...` para cada item da lista com `id` presente;
2. `insert into estudios (id, local_id, nome) values ...` para cada item sem `id`;
3. `update estudios set deleted_at = now() where local_id = $1 and id <> all($2)` — todo estúdio do
   local que não veio na lista enviada é soft-deleted (vai pra lixeira, não é apagado de fato).

`softDeleteEstudio` existe à parte pra restaurar/expurgar um estúdio isolado direto pela lixeira
(seção 6) sem precisar reabrir o formulário do local inteiro.

## 6. Lixeira

Estende `lib/db/queries.ts`, mesmo mecanismo já usado por credential/room/cliente/fornecedor/
produto/combo/plano:

- `TrashItem.kind` ganha `'local_gravacao' | 'estudio'`;
- `listTrash()` ganha dois `union all`; a linha de `estudio` mostra o nome do local como
  `room_name` (reaproveitando a coluna que já existe pra dar contexto, em vez de criar uma nova só
  pra isso — mesmo truque que `room_name` já faz pra credencial dentro de sala);
- `restoreItem`/`purgeItem` ganham os dois `case` novos.

**Apagar o local não arrasta os estúdios.** Local vai pra lixeira sozinho; estúdios continuam
ativos no banco (órfãos de um local inativo) até serem apagados um por um ou até o local ser
restaurado. Formulário/listagem de estúdio sempre filtra por `local.deleted_at is null`, então na
prática eles somem da tela junto — mas continuam existindo, e restaurar o local os traz de volta
sem precisar recriar nada. Evita o mesmo problema do cascade duro: quando a Agenda existir, um
estúdio referenciado por agendamento não pode desaparecer só porque alguém apagou o local por
engano.

**Expurgo:** sem checagem de "em uso" nesta rodada (Agenda ainda não referencia `estudio_id` — não
há o que checar). Quando a Agenda for implementada, reaproveita `ItemEmUsoError` do módulo Produtos
pra bloquear expurgo de estúdio com agendamento.

## 7. Formulário / UI

`components/LocalGravacaoClient.tsx`, mesmo molde de `ComboClient`/`PlanoClient` (grid + modal de
edição), com a lista de estúdios editada inline via um repetidor de campo simples (adicionar linha
com nome, remover linha) — não precisa do `ItemRepetidor` existente (aquele é pra escolher
produto/combo de uma lista fixa com quantidade; aqui é texto livre, sem quantidade). Componente
novo e pequeno, `components/EstudiosRepetidor.tsx`, controlado do mesmo jeito (estado no pai,
`onChange`).

Rotas: `app/(app)/cadastros/locais-gravacao/{page.tsx,actions.ts}`.

## 8. Permissão

Master only: `canManageLocaisGravacao` em `lib/authz.ts`, mesmo formato de `canManageProdutos`
(`isMaster(actor)`). Função própria, não reaproveita `canManageTerceiros` nem `canManageProdutos` —
mesma justificativa já registrada na spec de Clientes/Fornecedores: hoje as três empatam em "só
master", mas são permissões conceitualmente diferentes.

## 9. Auditoria

`lib/db/audit.ts`: `entityType` ganha `'local_gravacao' | 'estudio'`. Ações `create`/`update`/
`delete`/`restore`/`purge` já existem em `AUDIT_ACTIONS`, sem ampliar essa união.

## 10. Menu

`components/Sidebar.tsx`, grupo "Cadastros", item novo "Locais de Gravação" →
`/cadastros/locais-gravacao`, ao lado de Clientes/Fornecedores, atrás de `canManageLocaisGravacao`.

## 11. Testes

**Puros, sem banco:**
- `canManageLocaisGravacao`: master `true`, comum `false`.
- Validação de formulário (`lib/locais-gravacao-form.ts`, mesmo estilo de `terceiros-form.ts`):
  nome do local obrigatório, nome de estúdio obrigatório, lista de estúdios pode ser vazia
  (local pode nascer sem estúdio e ganhar depois).

**Integração, contra o banco real** (`tests/integracao.test.ts`):
- criar local com 2 estúdios, listar, editar renomeando um estúdio existente e adicionando um
  novo — confirma que o `id` do estúdio renomeado não muda;
- remover um estúdio da lista no update → confirma que ele foi soft-deleted (sai da listagem do
  local, aparece em `listTrash()` com `kind: 'estudio'`);
- soft delete do local não altera `deleted_at` dos estúdios dele;
- restaurar local restaura só o local, estúdios continuam com o `deleted_at` que já tinham.

**Componente, jsdom:**
- `LocalGravacaoClient`: adicionar/remover linha de estúdio no formulário atualiza a lista
  enviada no submit.

## 12. Fora de escopo

- Toda a Agenda (grade semanal, drag-and-drop, bloqueio de conflito, status, cores) — spec
  própria, depende deste cadastro estar pronto;
- checagem de "estúdio em uso" no expurgo (não há o que referenciar ainda);
- permissão granular por usuário comum (mesma nota das specs anteriores — depende de revisão do
  `module_access`);
- capacidade, equipamento ou qualquer outro atributo do estúdio além do nome.
