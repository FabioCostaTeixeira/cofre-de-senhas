# Agenda — Design

**Data:** 2026-08-11
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

Agenda semanal estilo ClickUp pra agendar serviços de gravação: um card por agendamento, arrastável
entre dias/horários, com bloqueio de conflito por estúdio. Depende do cadastro de **Local de
Gravação** (spec e implementação já prontas — `locais_gravacao`/`estudios`) e do cadastro de
**Categorias de Produto** (já existente, módulo Produtos) pro "tipo de gravação".

**Escopo desta rodada:** CRUD de agendamento, grade semanal com drag (mover) e resize (duração),
bloqueio de conflito de horário por estúdio, lixeira, auditoria, master-only. Designação de
tarefas/atividades pra usuários **não** faz parte (descartado explicitamente durante o
brainstorming — foi citado por engano no pedido original).

## 2. Entidade

Uma tabela só, `agendamentos` — não há hierarquia como em Local de Gravação. Cada linha é um card:
cliente + local + estúdio + tipo de gravação + status + janela de horário num dia.

## 3. Campos

| Campo | Coluna | Obrigatório | Observação |
|---|---|---|---|
| cliente | `cliente_id` | sim | FK `clientes(id)` |
| local de gravação | `local_id` | sim | FK `locais_gravacao(id)` |
| estúdio | `estudio_id` | sim | FK `estudios(id)` — pertence ao `local_id` acima |
| tipo de gravação | `categoria_produto_id` | sim | FK `categorias_produto(id)` |
| status | `status` | sim | um de: `cancelado`, `agendado`, `pre_agendado`, `gravando`, `concluido` |
| data | `data` | sim | dia do agendamento |
| horário de início | `hora_inicio` | sim | granularidade de 15min |
| horário de fim | `hora_fim` | sim | granularidade de 15min, sempre > início |

## 4. Schema

Migration nova: `db/migrations/008_agenda.sql`.

```sql
-- Agendamento de servico de gravacao. Uma tabela so — nao ha hierarquia como em
-- locais_gravacao/estudios. status='cancelado' NAO conta pra checagem de conflito
-- de horario (decisao do brainstorming): um agendamento cancelado libera o
-- estudio pra outro, mas continua visivel na grade (vermelho) como historico.
create table agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id),
  local_id             uuid not null references locais_gravacao(id),
  estudio_id           uuid not null references estudios(id),
  categoria_produto_id uuid not null references categorias_produto(id),
  status               text not null check (
    status in ('cancelado', 'agendado', 'pre_agendado', 'gravando', 'concluido')
  ),
  data                 date not null,
  hora_inicio          time not null,
  hora_fim             time not null check (hora_fim > hora_inicio),
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index agendamentos_estudio_data_idx on agendamentos (estudio_id, data);
```

Índice composto `(estudio_id, data)`: é exatamente o filtro da checagem de conflito e da consulta
da grade semanal (um estúdio, uma janela de datas).

Sem `on delete cascade` em nenhuma das 4 FKs — apagar cliente/local/estúdio/categoria não deve
apagar agendamento nenhum implicitamente (mesma filosofia já usada no resto do projeto). Como
nenhuma dessas 4 entidades tem hoje uma checagem de "em uso" que cubra `agendamentos`, isso é uma
dívida técnica que fica registrada: o dia em que alguém apagar de vez (expurgar) um cliente/local/
estúdio/categoria referenciado por um agendamento vai bater na FK crua — mesmo problema que a
revisão final do Local de Gravação achou e corrigiu pra `estudio`↔`local`, mas agora se estende a
mais 3 direções. Tratar isso aqui SUPRIRIA o escopo desta rodada (exigiria `ItemEmUsoError` em
`clientes`, `categorias_produto` e no expurgo de `estudio`/`local_gravacao`, hoje sem essa
checagem) — fica registrado como fora de escopo (seção 12), não como bug desta spec.

## 5. Camada de dados

`lib/db/agenda.ts`:

```ts
export type StatusAgendamento = 'cancelado' | 'agendado' | 'pre_agendado' | 'gravando' | 'concluido';

export type Agendamento = {
  id: string;
  cliente_id: string; cliente_nome: string;
  local_id: string; estudio_id: string; estudio_nome: string;
  categoria_produto_id: string; categoria_nome: string;
  status: StatusAgendamento;
  data: string; hora_inicio: string; hora_fim: string;
  created_at: string;
};

export type DadosAgendamento = {
  cliente_id: string; local_id: string; estudio_id: string; categoria_produto_id: string;
  status: StatusAgendamento; data: string; hora_inicio: string; hora_fim: string;
};

export async function listAgendamentosDaSemana(
  estudioId: string, inicioSemana: string,
): Promise<Agendamento[]>
export async function createAgendamento(dados: DadosAgendamento): Promise<string>
export async function updateAgendamento(id: string, dados: DadosAgendamento): Promise<void>
/** Só troca data/hora_inicio/hora_fim — usado por mover e redimensionar (o card
 *  já existe, só a janela de tempo muda; os outros campos ficam intactos). */
export async function moverOuRedimensionar(
  id: string, data: string, horaInicio: string, horaFim: string,
): Promise<void>
export async function softDeleteAgendamento(id: string): Promise<void>
```

**Checagem de conflito**, comum a `createAgendamento`/`updateAgendamento`/`moverOuRedimensionar`:
antes de gravar, uma query busca qualquer outro agendamento (`id` diferente, quando for update/
move) no mesmo `estudio_id`, mesma `data`, `status <> 'cancelado'`, `deleted_at is null`, cuja
faixa `[hora_inicio, hora_fim)` sobreponha a nova (`hora_inicio < novo.hora_fim and hora_fim >
novo.hora_inicio`). Se achar, lança `ConflitoHorarioError` — mesmo molde de `ItemEmUsoError`
(classe de erro própria, capturada na Server Action, vira mensagem amigável em vez de deixar o
`check` do banco ou uma condição de corrida virar 500). **Não há `check` de exclusão no banco**
(um `exclude` de faixa exigiria a extensão `btree_gist`, que o projeto não usa hoje) — a checagem é
inteiramente em código, ciente de que existe uma janela teórica de corrida entre dois masters
agendando o mesmo estúdio/horário ao mesmo tempo; aceitável pelo volume de uso real (equipe
pequena), registrado como limitação conhecida.

## 6. UI: grade semanal

`components/AgendaClient.tsx` — client component. Estrutura:

- **Seletor no topo:** Local de Gravação → Estúdio (dropdown dependente, mesmo padrão de qualquer
  outro formulário do projeto) + navegação de semana (◀ semana atual ▶). Trocar o seletor ou a
  semana dispara nova busca (via Server Action ou `router.refresh`, a decidir na task).
- **Grade:** 7 colunas (seg-dom), cada uma com 96 linhas de 15min (00h-23h45) e rótulo de hora à
  esquerda. Coluna com `overflow-y: auto`, altura de linha fixa em pixel (ex.: 16px/bloco).
- **Card:** `position: absolute` dentro da coluna do dia certo, `top`/`height` calculados a partir
  de `hora_inicio`/`hora_fim` em pixels. Cor de fundo por status:

  | Status | Cor |
  |---|---|
  | Cancelado | vermelho |
  | Agendado | verde |
  | Pré Agendado | amarelo |
  | Gravando | azul claro |
  | Concluído | azul escuro |

- **Mover:** `pointerdown` no corpo do card inicia arraste; `pointermove` recalcula dia (coluna sob
  o cursor) + horário de início (posição vertical, snap de 15min), duração original preservada;
  `pointerup` chama `moverOuRedimensionar` com a nova janela. Falha de conflito reverte a posição
  visual (estado otimista descartado) e mostra erro.
- **Redimensionar:** alça na borda inferior do card; `pointerdown` ali inicia resize (não mover);
  `pointermove` recalcula só `hora_fim` (snap de 15min, mínimo 15min de duração); `pointerup`
  chama `moverOuRedimensionar`.
- **Editar:** clique simples (sem arrastar) no corpo do card abre modal com os 7 campos completos,
  reaproveitando `salvarAgendamento`.
- **Criar:** botão "Novo agendamento" abre o mesmo modal em branco (sem posição pré-definida na
  grade — usuário escolhe data/horário nos campos, mesmo padrão dos outros cadastros do projeto).

Implementação com pointer events nativos (`onPointerDown`/`onPointerMove`/`onPointerUp`), sem
biblioteca de drag-and-drop nova — decisão do brainstorming, mesma linha de "sem dependência nova"
já seguida no resto do projeto.

## 7. Lixeira e auditoria

Estende `lib/db/queries.ts` e `lib/db/audit.ts`, mesmo mecanismo já usado pelas 9 entidades atuais:

- `TrashItem.kind` ganha `'agendamento'`; `listTrash()` ganha mais um `union all` (título = nome do
  cliente + data, pra ficar identificável na lista); `restoreItem`/`purgeItem` ganham o `case`.
- `lib/db/audit.ts`: `entityType` ganha `'agendamento'`.
- Sem checagem de "em uso" no expurgo — agendamento não é referenciado por nada.

## 8. Permissão

Master only: `canManageAgenda` em `lib/authz.ts`, mesmo formato de `canManageLocaisGravacao`.

## 9. Menu

`components/Sidebar.tsx`: grupo novo "Agenda" (like "Produtos", ao lado de Cadastros/Produtos/Cofre
de Senhas), um item só → `/agenda`, atrás de `canManageAgenda`.

## 10. Formulário / validação

`lib/agenda-form.ts` (puro, sem I/O): `lerDadosAgendamento(fd: FormData): DadosAgendamento |
{ error: string }` — valida os 4 ids (presentes, formato uuid), `status` (um dos 5 valores),
`data` (formato `yyyy-mm-dd`), `hora_inicio`/`hora_fim` (formato `HH:mm`, múltiplo de 15 minutos,
`hora_fim > hora_inicio`).

## 11. Testes

**Puros, sem banco:**
- `canManageAgenda`: master `true`, comum `false`.
- `lerDadosAgendamento`: campos obrigatórios faltando, status inválido, horário fora do múltiplo de
  15min, `hora_fim <= hora_inicio` — cada um retorna erro específico.

**Integração, contra o banco real:**
- criar agendamento, listar na semana certa (`listAgendamentosDaSemana`);
- dois agendamentos no mesmo estúdio/dia com horário sobreposto → o segundo rejeita com
  `ConflitoHorarioError`; em estúdios diferentes, sem problema;
- agendamento com status `cancelado` não bloqueia outro no mesmo horário/estúdio;
- mover (`moverOuRedimensionar`) pra um horário livre funciona; pra um horário ocupado (outro
  estúdio ocupado) rejeita, sem alterar a linha original;
- soft-delete → aparece em `listTrash()` com `kind: 'agendamento'` → restaura → expurga.

**Componente, jsdom:** cálculo de posição/altura do card a partir de `hora_inicio`/`hora_fim` (função
pura extraída do componente, ex. `calcularPosicaoCard`), separado da mecânica de pointer events (essa
não é testável de forma significativa em jsdom — mesma regra já registrada nas specs anteriores).

## 12. Fora de escopo

- Designação de tarefas/atividades genéricas pra usuários (não é agendamento de cliente) —
  descartado no brainstorming, citado por engano no pedido original;
- `ItemEmUsoError` no expurgo de cliente/local/estúdio/categoria referenciado por agendamento (a
  FK crua vai estourar 500 até isso ser tratado — ver seção 4);
- notificação/lembrete de agendamento próximo;
- exportação da agenda (PDF, iCal etc.);
- confirmação automática de horário por e-mail/WhatsApp pro cliente;
- relatório de ocupação por estúdio/período;
- suporte a toque (mobile) na grade — pointer events cobrem mouse e touch no nível da API, mas o
  layout/UX pra tela pequena não é objetivo desta rodada.
