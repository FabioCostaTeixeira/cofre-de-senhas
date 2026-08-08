# Cadastro de Clientes e Fornecedores — Design

**Data:** 2026-08-08
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

O módulo Cadastros (menu, ao lado de Usuários) ganha dois cadastros novos: **Clientes** e
**Fornecedores**. São terceiros com quem a empresa se relaciona — hoje sem CPF/CNPJ, sem vínculo
com salas ou usuários do Cofre. Esse vínculo pode vir depois, mas não faz parte desta rodada.

**Escopo desta rodada:** as duas entidades, CRUD completo, lixeira e auditoria. Permissão fina por
usuário (quem além do master pode gerenciar) fica pra quando o mecanismo de módulo for estendido —
ver seção 7.

## 2. Duas entidades, não uma

Clientes e fornecedores são **tabelas separadas** (`clientes`, `fornecedores`), não uma tabela só
com campo `tipo`. Decisão de negócio: são conceitos diferentes que hoje têm os mesmos campos, mas
não necessariamente vão continuar assim (ex.: fornecedor pode ganhar dado bancário, cliente pode
ganhar CNPJ, sem que um puxe o outro).

## 3. Campos

Idênticos nas duas tabelas hoje:

| Campo | Coluna | Obrigatório | Observação |
|---|---|---|---|
| nome completo | `nome` | sim | único campo obrigatório |
| contato responsável | `contato_responsavel` | não | texto livre |
| e-mail | `email` | não | sem `unique` — nada nesta rodada exige |
| telefone | `telefone` | não | máscara `(00) 00000-0000` na tela, dígitos no banco |
| cidade | `cidade` | não | texto livre |
| estado | `uf` | não | sigla, 2 letras maiúsculas, mesmo padrão de `pessoas.uf` |
| data de criação | `created_at` | — | automático, não editável |

Nenhum campo cifrado — diferente de `pessoas`, não há documento sensível aqui.

## 4. Schema

Migration nova: `db/migrations/005_clientes_fornecedores.sql`.

```sql
create table clientes (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  contato_responsavel text,
  email               text,
  telefone            text,
  cidade              text,
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table fornecedores (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  contato_responsavel text,
  email               text,
  telefone            text,
  cidade              text,
  uf                  text check (uf is null or uf ~ '^[A-Z]{2}$'),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

Escritas por extenso, sem `like ... including all`: mesmo estilo das migrations anteriores neste
projeto, e cada tabela fica legível sozinha em vez de depender da outra pra saber sua forma.

## 5. Camada de dados: genérica, sem duplicar CRUD duas vezes

As duas tabelas têm forma idêntica, então o acesso a dado é um módulo genérico só,
`lib/db/terceiros.ts`, parametrizado pelo nome da tabela — e não dois arquivos quase iguais:

```ts
export type TipoTerceiro = 'clientes' | 'fornecedores';

export type Terceiro = {
  id: string;
  nome: string;
  contato_responsavel: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  created_at: string;
};

export type DadosTerceiro = Omit<Terceiro, 'id' | 'created_at'>;

export async function listTerceiros(tabela: TipoTerceiro): Promise<Terceiro[]>
export async function getTerceiro(tabela: TipoTerceiro, id: string): Promise<Terceiro | null>
export async function createTerceiro(tabela: TipoTerceiro, dados: DadosTerceiro): Promise<string>
export async function updateTerceiro(
  tabela: TipoTerceiro, id: string, dados: DadosTerceiro,
): Promise<void>
export async function softDeleteTerceiro(tabela: TipoTerceiro, id: string): Promise<void>
```

`tabela` é sempre um literal do tipo `TipoTerceiro`, escolhido pelo próprio código de cada rota
(`/cadastros/clientes` chama sempre com `'clientes'`) — nunca vem de formulário nem de qualquer
entrada externa. Não é interpolação de identificador a partir de input do usuário.

O tagged template `sql\`...\`` não aceita nome de tabela como parâmetro dinâmico (viraria
`$1`, uma string, não um identificador). `terceiros.ts` usa `sql.query(texto, params)` — método que
a lib `@neondatabase/serverless` expõe no mesmo client — montando o texto da query com `tabela`
interpolado diretamente (seguro, por ser sempre um dos dois literais do union type) e os valores
de fato como `params` posicionais.

**UI espelha a mesma ideia.** Um componente `TerceiroClient` genérico (grid + modal com os 7
campos) recebe `tipo: 'cliente' | 'fornecedor'` pra rótulos e mensagens. Cada rota tem `page.tsx` e
`actions.ts` finos, só encaminhando pra esse componente e pras funções genéricas com a tabela
certa:

```
app/(app)/cadastros/clientes/page.tsx        → TerceiroClient tipo="cliente"
app/(app)/cadastros/clientes/actions.ts      → chama terceiros.ts com 'clientes'
app/(app)/cadastros/fornecedores/page.tsx    → TerceiroClient tipo="fornecedor"
app/(app)/cadastros/fornecedores/actions.ts  → chama terceiros.ts com 'fornecedores'
```

## 6. Lixeira

Estende o mecanismo existente em `lib/db/queries.ts` em vez de criar um segundo:

- `TrashItem.kind` ganha `'cliente' | 'fornecedor'` na união (hoje `'credential' | 'room'`);
- `listTrash()` ganha mais dois `union all` (um por tabela);
- `restoreItem` e `purgeItem` ganham mais dois `case` no `kind`.

Sem cascata: diferente de sala→credencial, apagar um cliente ou fornecedor não arrasta nenhuma
outra linha junto — hoje eles não têm filhos.

## 7. Permissão

Só master gerencia (`requireMaster()` nas rotas, mesmo padrão de `/admin/*`), e o item some do menu
pra quem não é master — igual `canManageUsers` hoje. Nasce uma função nova em `lib/authz.ts`,
`canManageTerceiros`, no mesmo formato de `canManageUsers`, em vez de reusar a existente: são
permissões conceitualmente diferentes (gerenciar usuário do sistema vs. gerenciar cadastro de
terceiro), mesmo empatando em "master apenas" hoje — se um dia usuário comum ganhar acesso a um mas
não ao outro, a separação já existe.

Conceder acesso a usuário comum fica pra quando o mecanismo de `module_access` for revisado —
**fora desta rodada**, registrado aqui pra não se perder.

## 8. Auditoria

`lib/db/audit.ts`: `entity_type` ganha `'cliente' | 'fornecedor'` na união (hoje
`'credential' | 'room' | 'user'`). As ações reaproveitam as genéricas que já existem em
`AUDIT_ACTIONS` — `create`, `update`, `delete`, `restore`, `purge` — sem precisar ampliar essa
união.

## 9. Menu

`components/Sidebar.tsx`, dentro do grupo "Cadastros" (já existe, hoje só com Usuários), dois itens
novos: "Clientes" → `/cadastros/clientes`, "Fornecedores" → `/cadastros/fornecedores`. Só
aparecem pra master (`canManageTerceiros`), mesmo critério visual que os itens de `/admin/*` já
usam no grupo Cofre de Senhas.

## 10. Máscaras e validação

Telefone: mesma máscara `(00) 00000-0000` já usada em `pessoas`/`users`, banco guarda só dígitos.
UF: mesma regra de `pessoas.uf` (2 letras maiúsculas), maiúsculas forçadas na digitação. E-mail:
validação de formato básica no cliente, sem checagem de unicidade (seção 3).

## 11. Testes

**Puros, sem banco:**
- `canManageTerceiros`: master vê `true`, comum vê `false` — mesmas combinações de
  `canManageUsers`.

**Integração, contra o banco real** (`tests/integracao.test.ts`):
- create/update/list/get em cada tabela (`clientes`, `fornecedores`);
- soft delete tira da listagem normal e põe em `listTrash()` com o `kind` certo;
- `restoreItem`/`purgeItem` funcionam pros dois `kind` novos;
- UF inválida (3 letras, minúscula) rejeitada pelo `check`; UF nula aceita;
- e-mail duplicado entre duas linhas da mesma tabela é aceito (não há `unique`).

**Componente, jsdom:**
- `TerceiroClient` com `tipo="cliente"` mostra rótulos de cliente; com `tipo="fornecedor"`, os de
  fornecedor — garante que o componente genérico não vaza texto fixo de um tipo pro outro.

## 12. Fora de escopo

- CPF/CNPJ e qualquer documento;
- vínculo com salas, usuários ou credenciais;
- permissão granular por usuário comum (depende de revisão do `module_access` — seção 7);
- busca de CEP (esses cadastros não têm endereço completo, só cidade/UF);
- exportação, importação em lote, busca/filtro avançado na grid.
