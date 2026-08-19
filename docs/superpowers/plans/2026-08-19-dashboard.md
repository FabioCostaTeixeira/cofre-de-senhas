# Dashboard (nova home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um dashboard de indicadores gerenciais que passa a ser a home (`/`) do app,
movendo o Cofre de Senhas atual para `/senhas`.

**Architecture:** Uma função pura de cálculo (janela de horário + intervalo de período,
sem tocar banco, TDD completo), uma camada de queries agregadas em `lib/db/dashboard.ts`
(mesmo padrão dos outros módulos `lib/db/*.ts`, sem teste dedicado — consistente com o
resto do projeto, onde só lógica pura ganha teste de unidade), e a página em si
(`app/(app)/page.tsx`, Server Component) que compõe as duas camadas. O Cofre de Senhas
atual muda de rota sem mudança de conteúdo.

**Tech Stack:** Next.js 15 (App Router, Server Components), TypeScript, `@neondatabase/serverless`
(tagged template `sql`), Tailwind (classes `.glass`/`.btn` já existentes), Vitest.

## Global Constraints

- Sem gráficos de biblioteca externa — só números e uma barra de progresso em CSS puro
  (`div` com `width` proporcional).
- Sem novo `module_access` — dashboard e Cofre de Senhas continuam visíveis a todo
  usuário logado, mesmo padrão de hoje.
- Página é 100% Server Component — seletor de período é `<Link>` mudando querystring
  (`?periodo=hoje|semana|mes`), nunca `useState`/`'use client'`.
- Janela de disponibilidade dos studios é fixa, **08:00–20:00**, igual para todos —
  não existe (e não se cria neste plano) campo de horário de funcionamento no cadastro.
- Total de clientes não é afetado pelo seletor de período (é contagem total, não histórica).
- Nenhuma mudança de schema de banco.

---

### Task 1: Função pura de cálculo (`lib/dashboard-calc.ts`)

Intervalo de datas por período (hoje/semana/mês) e cálculo de tempo livre/agendado por
studio dentro da janela 08:00–20:00. Sem acesso a banco — só lógica, testável isolada.

**Files:**
- Create: `lib/dashboard-calc.ts`
- Test: `tests/dashboard-calc.test.ts`

**Interfaces:**
- Consumes: nada (função pura, `Date` nativo)
- Produces:
  - `type Periodo = 'hoje' | 'semana' | 'mes'`
  - `type IntervaloPeriodo = { inicio: string; fim: string; dias: number }`
  - `function periodoParaIntervalo(periodo: Periodo, hoje?: Date): IntervaloPeriodo`
  - `type BlocoTempo = { hora_inicio: string; hora_fim: string }`
  - `type TempoStudio = { minutosLivres: number; minutosAgendados: number }`
  - `function calcularTempoStudio(blocos: BlocoTempo[], dias: number): TempoStudio`
  - `function formatarMinutos(minutos: number): string` (ex: `370` → `"6h10"`, `480` → `"8h"`)

- [ ] **Step 1: Escreve os testes de `periodoParaIntervalo`**

```typescript
// tests/dashboard-calc.test.ts
import { describe, expect, it } from 'vitest';
import {
  calcularTempoStudio, formatarMinutos, periodoParaIntervalo,
} from '@/lib/dashboard-calc';

describe('periodoParaIntervalo', () => {
  it('hoje: intervalo de 1 dia, [hoje, amanhã)', () => {
    const r = periodoParaIntervalo('hoje', new Date(2026, 7, 19)); // 19/ago/2026, quarta
    expect(r).toEqual({ inicio: '2026-08-19', fim: '2026-08-20', dias: 1 });
  });

  it('semana: segunda a domingo da semana corrente, 7 dias', () => {
    // 19/ago/2026 é uma quarta-feira (dia 3). Segunda dessa semana: 17/ago.
    const r = periodoParaIntervalo('semana', new Date(2026, 7, 19));
    expect(r).toEqual({ inicio: '2026-08-17', fim: '2026-08-24', dias: 7 });
  });

  it('semana: domingo pertence à semana que termina nele, não à seguinte', () => {
    // 23/ago/2026 é domingo. Segunda dessa semana: 17/ago (mesma semana do teste acima).
    const r = periodoParaIntervalo('semana', new Date(2026, 7, 23));
    expect(r).toEqual({ inicio: '2026-08-17', fim: '2026-08-24', dias: 7 });
  });

  it('mes: do dia 1 ao dia 1 do mês seguinte, dias = tamanho do mês', () => {
    const r = periodoParaIntervalo('mes', new Date(2026, 7, 19)); // agosto tem 31 dias
    expect(r).toEqual({ inicio: '2026-08-01', fim: '2026-09-01', dias: 31 });
  });

  it('mes: fevereiro (28 dias em 2026, não bissexto)', () => {
    const r = periodoParaIntervalo('mes', new Date(2026, 1, 10));
    expect(r).toEqual({ inicio: '2026-02-01', fim: '2026-03-01', dias: 28 });
  });
});
```

- [ ] **Step 2: Roda os testes, confirma que falham** (módulo ainda não existe)

```bash
npx vitest run tests/dashboard-calc.test.ts
```

Esperado: falha com "Cannot find module '@/lib/dashboard-calc'" ou similar.

- [ ] **Step 3: Implementa `periodoParaIntervalo`**

```typescript
// lib/dashboard-calc.ts
export type Periodo = 'hoje' | 'semana' | 'mes';

export type IntervaloPeriodo = { inicio: string; fim: string; dias: number };

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `hoje` é injetável pra testar; em produção sempre `new Date()`. Segue a mesma
 * convenção de `hojeISO()` em components/AgendaClient.tsx: monta a data local com
 * `new Date(ano, mes, dia)` e usa `toISOString().slice(0, 10)` só pra formatar
 * como string — não há troca de fuso aqui porque os três campos (ano/mês/dia) já
 * vêm de `getFullYear`/`getMonth`/`getDate`, que são locais.
 */
export function periodoParaIntervalo(periodo: Periodo, hoje: Date = new Date()): IntervaloPeriodo {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = hoje.getDate();

  if (periodo === 'hoje') {
    const inicio = new Date(ano, mes, dia);
    const fim = new Date(ano, mes, dia + 1);
    return { inicio: paraISO(inicio), fim: paraISO(fim), dias: 1 };
  }

  if (periodo === 'semana') {
    const diaSemana = hoje.getDay(); // 0=domingo..6=sábado
    const deltaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
    const inicio = new Date(ano, mes, dia + deltaSegunda);
    const fim = new Date(ano, mes, dia + deltaSegunda + 7);
    return { inicio: paraISO(inicio), fim: paraISO(fim), dias: 7 };
  }

  const inicio = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 1);
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
  return { inicio: paraISO(inicio), fim: paraISO(fim), dias };
}
```

- [ ] **Step 4: Roda os testes de `periodoParaIntervalo`, confirma que passam**

```bash
npx vitest run tests/dashboard-calc.test.ts
```

- [ ] **Step 5: Escreve os testes de `calcularTempoStudio` (janela 08:00–20:00)**

Adiciona ao mesmo arquivo `tests/dashboard-calc.test.ts`:

```typescript
describe('calcularTempoStudio', () => {
  it('sem blocos, 1 dia: 12h livres, 0 agendadas', () => {
    const r = calcularTempoStudio([], 1);
    expect(r).toEqual({ minutosLivres: 720, minutosAgendados: 0 });
  });

  it('bloco totalmente dentro da janela conta inteiro', () => {
    const r = calcularTempoStudio([{ hora_inicio: '09:00:00', hora_fim: '10:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 660, minutosAgendados: 60 });
  });

  it('bloco cruzando os dois limites é truncado pra janela inteira (08:00–20:00)', () => {
    const r = calcularTempoStudio([{ hora_inicio: '07:00:00', hora_fim: '21:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 0, minutosAgendados: 720 });
  });

  it('bloco parcialmente antes da janela conta só a parte dentro', () => {
    const r = calcularTempoStudio([{ hora_inicio: '07:00:00', hora_fim: '09:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 660, minutosAgendados: 60 });
  });

  it('bloco parcialmente depois da janela conta só a parte dentro', () => {
    const r = calcularTempoStudio([{ hora_inicio: '19:00:00', hora_fim: '21:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 660, minutosAgendados: 60 });
  });

  it('bloco totalmente fora da janela (antes) conta zero', () => {
    const r = calcularTempoStudio([{ hora_inicio: '06:00:00', hora_fim: '07:30:00' }], 1);
    expect(r).toEqual({ minutosLivres: 720, minutosAgendados: 0 });
  });

  it('bloco totalmente fora da janela (depois) conta zero', () => {
    const r = calcularTempoStudio([{ hora_inicio: '21:00:00', hora_fim: '22:00:00' }], 1);
    expect(r).toEqual({ minutosLivres: 720, minutosAgendados: 0 });
  });

  it('vários blocos somam, capacidade escala com dias', () => {
    const r = calcularTempoStudio(
      [
        { hora_inicio: '09:00:00', hora_fim: '10:00:00' },
        { hora_inicio: '14:00:00', hora_fim: '16:00:00' },
      ],
      7,
    );
    // capacidade = 720 * 7 = 5040; agendado = 60 + 120 = 180
    expect(r).toEqual({ minutosLivres: 4860, minutosAgendados: 180 });
  });
});

describe('formatarMinutos', () => {
  it('minutos exatos em horas', () => {
    expect(formatarMinutos(480)).toBe('8h');
  });

  it('minutos com resto', () => {
    expect(formatarMinutos(370)).toBe('6h10');
  });

  it('zero minutos', () => {
    expect(formatarMinutos(0)).toBe('0h');
  });

  it('menos de uma hora', () => {
    expect(formatarMinutos(45)).toBe('0h45');
  });
});
```

- [ ] **Step 6: Roda os testes novos, confirma que falham**

```bash
npx vitest run tests/dashboard-calc.test.ts
```

- [ ] **Step 7: Implementa `calcularTempoStudio` e `formatarMinutos`**

Adiciona ao mesmo arquivo `lib/dashboard-calc.ts`:

```typescript
const JANELA_INICIO_MIN = 8 * 60;
const JANELA_FIM_MIN = 20 * 60;

export type BlocoTempo = { hora_inicio: string; hora_fim: string };

function paraMinutos(horaHHMMSS: string): number {
  const [h, m] = horaHHMMSS.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos do bloco que caem dentro de 08:00–20:00, nunca negativo. */
function minutosNaJanela(bloco: BlocoTempo): number {
  const inicio = Math.max(paraMinutos(bloco.hora_inicio), JANELA_INICIO_MIN);
  const fim = Math.min(paraMinutos(bloco.hora_fim), JANELA_FIM_MIN);
  return Math.max(fim - inicio, 0);
}

export type TempoStudio = { minutosLivres: number; minutosAgendados: number };

export function calcularTempoStudio(blocos: BlocoTempo[], dias: number): TempoStudio {
  const capacidadeMinutos = (JANELA_FIM_MIN - JANELA_INICIO_MIN) * dias;
  const minutosAgendados = blocos.reduce((soma, b) => soma + minutosNaJanela(b), 0);
  const minutosLivres = Math.max(capacidadeMinutos - minutosAgendados, 0);
  return { minutosLivres, minutosAgendados };
}

export function formatarMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
```

- [ ] **Step 8: Roda a suíte completa do arquivo, confirma que tudo passa**

```bash
npx vitest run tests/dashboard-calc.test.ts
```

Esperado: todos os `it` passando (5 de `periodoParaIntervalo` + 8 de `calcularTempoStudio`
+ 4 de `formatarMinutos` = 17 testes).

- [ ] **Step 9: Roda `tsc` e a suíte inteira, confirma que nada mais quebrou**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 10: Commit**

```bash
git add lib/dashboard-calc.ts tests/dashboard-calc.test.ts
git commit -m "Adiciona lib/dashboard-calc.ts: período e tempo livre/agendado por studio"
```

---

### Task 2: Queries agregadas (`lib/db/dashboard.ts`)

Camada de acesso a banco pros 4 indicadores. Mesmo padrão dos outros arquivos em
`lib/db/*.ts` (tagged template `sql`, sem teste dedicado — a lógica de negócio testável
já está na Task 1; isto aqui é SQL direto, no mesmo nível dos outros módulos do projeto
que também não têm teste unitário próprio, ex. `lib/db/contratacoes.ts`).

**Files:**
- Create: `lib/db/dashboard.ts`

**Interfaces:**
- Consumes: `sql` de `@/lib/db/client`; tipos `StatusAgendamento`, `TipoContratacao` de `@/lib/types`
- Produces:
  - `function contarClientesAtivos(): Promise<number>`
  - `type ContagemPorStatus = Record<StatusAgendamento, number>`
  - `function contarAgendamentosPorStatus(inicio: string, fim: string): Promise<ContagemPorStatus>`
  - `type QuantidadePorTipo = Record<TipoContratacao, number>`
  - `function somarVendasPorTipo(inicio: string, fim: string): Promise<QuantidadePorTipo>`
  - `type StudioComBlocos = { estudio_id: string; estudio_nome: string; local_nome: string; blocos: { hora_inicio: string; hora_fim: string }[] }`
  - `function listarStudiosComAgendamentos(inicio: string, fim: string): Promise<StudioComBlocos[]>`

  `inicio`/`fim` em todas as três funções acima que recebem: strings `YYYY-MM-DD`, mesmo
  formato retornado por `periodoParaIntervalo` (Task 1) — `fim` é exclusivo (`data < fim`).

- [ ] **Step 1: Cria `lib/db/dashboard.ts`**

```typescript
import { sql } from '@/lib/db/client';
import type { StatusAgendamento, TipoContratacao } from '@/lib/types';

export async function contarClientesAtivos(): Promise<number> {
  const rows = (await sql`
    select count(*)::int as total from clientes where deleted_at is null`) as { total: number }[];
  return rows[0].total;
}

export type ContagemPorStatus = Record<StatusAgendamento, number>;

/** `fim` é exclusivo: `data >= inicio and data < fim`. */
export async function contarAgendamentosPorStatus(
  inicio: string, fim: string,
): Promise<ContagemPorStatus> {
  const rows = (await sql`
    select status, count(*)::int as total
      from agendamentos
     where deleted_at is null and data >= ${inicio}::date and data < ${fim}::date
     group by status`) as { status: StatusAgendamento; total: number }[];
  const base: ContagemPorStatus = {
    agendado: 0, pre_agendado: 0, gravando: 0, concluido: 0, cancelado: 0,
  };
  for (const r of rows) base[r.status] = r.total;
  return base;
}

export type QuantidadePorTipo = Record<TipoContratacao, number>;

/** `fim` é exclusivo. Contratações canceladas (`deleted_at`) não contam — mesmo padrão
 *  de `listContratacoes` em lib/db/contratacoes.ts. */
export async function somarVendasPorTipo(inicio: string, fim: string): Promise<QuantidadePorTipo> {
  const rows = (await sql`
    select tipo, coalesce(sum(quantidade), 0)::int as total
      from contratacoes
     where deleted_at is null and created_at >= ${inicio}::date and created_at < ${fim}::date
     group by tipo`) as { tipo: TipoContratacao; total: number }[];
  const base: QuantidadePorTipo = { avulso: 0, combo: 0, plano: 0 };
  for (const r of rows) base[r.tipo] = r.total;
  return base;
}

export type StudioComBlocos = {
  estudio_id: string;
  estudio_nome: string;
  local_nome: string;
  blocos: { hora_inicio: string; hora_fim: string }[];
};

/** Um studio sem nenhum agendamento no período vem com `blocos: []`. `fim` exclusivo.
 *  Cancelados não entram nos blocos (liberam o studio, mesmo padrão de `existeConflito`
 *  em lib/db/agenda.ts). */
export async function listarStudiosComAgendamentos(
  inicio: string, fim: string,
): Promise<StudioComBlocos[]> {
  const rows = (await sql`
    select e.id as estudio_id, e.nome as estudio_nome, l.nome as local_nome,
           coalesce(
             json_agg(
               json_build_object('hora_inicio', a.hora_inicio::text, 'hora_fim', a.hora_fim::text)
               order by a.hora_inicio
             ) filter (where a.id is not null), '[]'
           ) as blocos
      from estudios e
      join locais_gravacao l on l.id = e.local_id and l.deleted_at is null
      left join agendamentos a on a.estudio_id = e.id and a.deleted_at is null
        and a.status <> 'cancelado' and a.data >= ${inicio}::date and a.data < ${fim}::date
     where e.deleted_at is null
     group by e.id, e.nome, l.nome
     order by l.nome, e.nome`) as StudioComBlocos[];
  return rows;
}
```

- [ ] **Step 2: Roda `tsc`, confirma que compila sem erros**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Roda a suíte inteira, confirma que nada quebrou** (este arquivo não é
  importado por nenhum outro ainda, então isto só confirma que a suíte continua verde)

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/dashboard.ts
git commit -m "Adiciona lib/db/dashboard.ts: queries agregadas do dashboard"
```

---

### Task 3: Move Cofre de Senhas pra /senhas + nova home (dashboard) + sidebar

Task de integração: move a home atual pra `/senhas`, cria o dashboard na raiz usando as
Tasks 1-2, e atualiza o sidebar (novo grupo "Painel" acima de "Cadastros", link "Salas"
apontando pra `/senhas`). Fica numa task só porque as duas metades (tirar o conteúdo
antigo de `/` e pôr o novo) precisam entrar no mesmo commit — do contrário `/` fica sem
página nenhuma entre uma e outra.

**Files:**
- Move: `app/(app)/page.tsx` → `app/(app)/senhas/page.tsx` (conteúdo idêntico, sem mudança)
- Create: `app/(app)/page.tsx` (novo dashboard)
- Modify: `components/Sidebar.tsx` — novo grupo "Painel", `href` de "Salas" muda pra `/senhas`

**Interfaces:**
- Consumes: `periodoParaIntervalo`, `calcularTempoStudio`, `formatarMinutos`, tipos
  `Periodo`/`BlocoTempo` de `@/lib/dashboard-calc` (Task 1); `contarClientesAtivos`,
  `contarAgendamentosPorStatus`, `somarVendasPorTipo`, `listarStudiosComAgendamentos` de
  `@/lib/db/dashboard` (Task 2); `requireReadyUser` de `@/lib/auth/guards`
- Produces: nova home em `/`, Cofre de Senhas em `/senhas`

- [ ] **Step 1: Move o arquivo da home atual pra `/senhas`, sem alterar conteúdo**

```bash
mkdir -p "app/(app)/senhas"
git mv "app/(app)/page.tsx" "app/(app)/senhas/page.tsx"
```

- [ ] **Step 2: Cria o novo `app/(app)/page.tsx` (dashboard)**

```typescript
import Link from 'next/link';
import { requireReadyUser } from '@/lib/auth/guards';
import {
  contarAgendamentosPorStatus, contarClientesAtivos, listarStudiosComAgendamentos,
  somarVendasPorTipo,
} from '@/lib/db/dashboard';
import {
  calcularTempoStudio, formatarMinutos, periodoParaIntervalo, type Periodo,
} from '@/lib/dashboard-calc';
import type { StatusAgendamento, TipoContratacao } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LABEL_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'Agendado', pre_agendado: 'Pré-agendado', gravando: 'Gravando',
  concluido: 'Concluído', cancelado: 'Cancelado',
};

const LABEL_TIPO: Record<TipoContratacao, string> = {
  avulso: 'Avulso', combo: 'Combo', plano: 'Plano',
};

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: 'hoje', label: 'Hoje' },
  { valor: 'semana', label: 'Semana' },
  { valor: 'mes', label: 'Mês' },
];

function periodoValido(v: string | undefined): Periodo {
  return v === 'semana' || v === 'mes' ? v : 'hoje';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireReadyUser();
  const { periodo: periodoParam } = await searchParams;
  const periodo = periodoValido(periodoParam);
  const { inicio, fim, dias } = periodoParaIntervalo(periodo);

  const [totalClientes, porStatus, porTipo, studios] = await Promise.all([
    contarClientesAtivos(),
    contarAgendamentosPorStatus(inicio, fim),
    somarVendasPorTipo(inicio, fim),
    listarStudiosComAgendamentos(inicio, fim),
  ]);

  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-8">
      <section className="glass p-6 max-w-xs">
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Total de Clientes</p>
        <p
          className="text-4xl font-semibold"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-heading)' }}
        >
          {totalClientes}
        </p>
      </section>

      <section className="space-y-6">
        <nav className="flex gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={`/?periodo=${p.valor}`}
              className={p.valor === periodo ? 'btn btn-primary' : 'btn'}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2">
          <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Agendamentos por status
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(LABEL_STATUS) as StatusAgendamento[]).map((s) => (
              <div key={s} className="glass p-4">
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{LABEL_STATUS[s]}</p>
                <p className="text-2xl font-semibold">{porStatus[s]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>Vendas por tipo</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(LABEL_TIPO) as TipoContratacao[]).map((t) => (
              <div key={t} className="glass p-4">
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{LABEL_TIPO[t]}</p>
                <p className="text-2xl font-semibold">{porTipo[t]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm" style={{ color: 'var(--text-dim)' }}>Tempo por studio</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studios.map((s) => {
              const { minutosLivres, minutosAgendados } = calcularTempoStudio(s.blocos, dias);
              const total = minutosLivres + minutosAgendados;
              const pctAgendado = total > 0 ? Math.round((minutosAgendados / total) * 100) : 0;
              return (
                <div key={s.estudio_id} className="glass p-4 space-y-2">
                  <p className="text-sm font-medium">{s.local_nome} — {s.estudio_nome}</p>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                    {formatarMinutos(minutosLivres)} livres / {formatarMinutos(minutosAgendados)} agendadas
                  </p>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pctAgendado}%`, background: 'var(--accent)' }}
                    />
                  </div>
                </div>
              );
            })}
            {studios.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Nenhum studio cadastrado.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Atualiza `components/Sidebar.tsx`** — adiciona `LayoutDashboard` ao import
  de ícones, insere o grupo "Painel" como primeiro item de `groups`, muda o `href` do
  item "Salas" de `/` pra `/senhas`

Import (linha 1): adiciona `LayoutDashboard` à lista de ícones importados de `lucide-react`
(ordem alfabética, entre `Home` e `Layers` — mantém a convenção do arquivo).

Novo primeiro item do array `groups` (antes do comentário `// Cadastros primeiro: ...`):

```typescript
{
  label: 'Painel',
  icon: <LayoutDashboard size={18} className={iconClass} />,
  items: [{ href: '/', label: 'Painel', icon: <LayoutDashboard size={18} className={iconClass} /> }],
},
```

No grupo `Cofre de Senhas` (final do array), muda:

```typescript
{ href: '/', label: 'Salas', icon: <Home size={18} className={iconClass} /> },
```

para:

```typescript
{ href: '/senhas', label: 'Salas', icon: <Home size={18} className={iconClass} /> },
```

- [ ] **Step 4: Roda `tsc`, confirma que compila sem erros**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Roda a suíte inteira**

```bash
npx vitest run
```

Nenhum teste existente referencia `app/(app)/page.tsx` por caminho de arquivo (só via
comportamento renderizado, que não muda no conteúdo movido) — a suíte deve continuar no
mesmo total de antes desta task, sem quebras.

- [ ] **Step 6: Verificação manual**

```bash
npm run dev
```

No navegador, logado:
- `/` mostra o dashboard: card de total de clientes, pills Hoje/Semana/Mês, cards de
  status de agendamento, cards de vendas por tipo, cards de tempo por studio com a barra
- Clicar em cada pill (Hoje/Semana/Mês) muda a URL pra `?periodo=...` e os números mudam
  de acordo
- `/senhas` mostra exatamente o que `/` mostrava antes (busca de credenciais + lista de
  salas) — comparar com o comportamento documentado antes desta task
- Sidebar mostra "Painel" como primeiro grupo, acima de "Cadastros"; "Cofre de Senhas" →
  "Salas" leva pra `/senhas`

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/page.tsx" "app/(app)/senhas/page.tsx" components/Sidebar.tsx
git commit -m "Move Cofre de Senhas para /senhas e cria dashboard como nova home"
```

---

## Testing

- **Task 1** cobre a lógica de negócio testável (período e truncagem de horário) com
  17 testes de unidade — é onde bugs de borda realmente aconteceriam.
- **Task 2** é SQL direto sem teste dedicado, mesmo padrão dos outros módulos
  `lib/db/*.ts` do projeto.
- **Task 3** é verificação manual (`npm run dev`) — Server Component sem lógica própria
  além de compor Tasks 1-2 e formatar HTML; o projeto não tem precedente de teste
  automatizado pra páginas Server Component (só componentes client e funções puras),
  então não introduz um padrão novo de teste só pra esta página.

```bash
npx tsc --noEmit
npx vitest run
```
