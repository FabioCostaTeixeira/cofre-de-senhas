# Forms, Logo & Agenda Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar todos os forms em modais glassmorphismo, aumentar logo 50%, e focar agenda no horário atual na carga.

**Architecture:** 
1. Novo ModalForm component reutilizável (wrapper glass para forms)
2. Logo aumentada de h-8 para h-12 em 3 lugares (SidebarShell)
3. Agenda com useEffect que scrolls para hora atual na carga
4. Refator dos 4 componentes Client (Categoria, Combo, Plano, Produto) para usar ModalForm

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind, glassmorphism já em globals.css

## Global Constraints

- Manter `.glass` class (backdrop-filter, rgba) — já bem definido
- Todos os modais devem ter `role="dialog"` + `aria-modal="true"` (a11y)
- Form labels nunca placeholder-only
- Close button sempre (X) + Escape key handler
- Nenhuma mudança de schema/API/banco

**Nota pós-execução (decisão tomada durante Task 3):** as Tasks 3-6 abaixo descrevem
originalmente converter só o modal de *edição* pra `ModalForm`, mantendo o fluxo de
*criação* como estava. Na prática, a primeira tentativa da Task 3 parou e perguntou ao
usuário assim que percebeu que o formulário de criação também fazia sentido virar modal
(consistência visual com o de edição, mesmo componente reaproveitado) — o usuário confirmou,
e a partir daí todas as Tasks 3-6 converteram **os dois fluxos, criação e edição**, não só
edição. O texto de cada task abaixo não foi atualizado para refletir isso na hora; leia
"o modal" como "os modais de criação e edição" em cada uma.

---

### Task 1: Logo & Agenda Focus

Aumentar logo 50% (h-8→h-12) em SidebarShell e adicionar scroll para hora atual em Agenda.

**Files:**
- Modify: `components/SidebarShell.tsx` — 3 ocorrências de `h-8`
- Modify: `components/AgendaClient.tsx` — adiciona useEffect com scrollIntoView

**Interfaces:**
- Consumes: nada novo
- Produces: logo maior em sidebar, agenda inicia com foco na hora atual

- [ ] **Step 1:** Lê SidebarShell.tsx, encontra todas as Image com logo

```bash
grep -n "logo-sidebar\|h-8" components/SidebarShell.tsx | head -10
```

- [ ] **Step 2:** Edita SidebarShell.tsx — troca 3× `h-8` por `h-12` nas linhas de Image

Procura por:
```typescript
className="h-8 w-auto flex-1 object-contain object-left"
className="h-8 w-auto"
```

Muda para:
```typescript
className="h-12 w-auto flex-1 object-contain object-left"
className="h-12 w-auto"
```

- [ ] **Step 3:** Roda testes (não quebra layout)

```bash
npx vitest run 2>&1 | tail -5
```

- [ ] **Step 4:** Lê AgendaClient.tsx, encontra onde o grid/timeline da agenda é renderizado

```bash
grep -n "useEffect\|useState\|hora\|time\|scroll" components/AgendaClient.tsx | head -20
```

- [ ] **Step 5:** Identifica como a agenda identifica cada "hora do dia" — procura por ids, data attributes, ou classes

```bash
grep -n "id=\|data-\|className=" components/AgendaClient.tsx | grep -i "hora\|time\|hour" | head -10
```

- [ ] **Step 6:** Implementa useEffect em AgendaClient que scrolla para hora atual

Se a agenda tem `id="agenda-hora-09"` ou similar:
```typescript
import { useEffect } from 'react';

export function AgendaClient({ ... }) {
  useEffect(() => {
    const agora = new Date();
    const hora = String(agora.getHours()).padStart(2, '0');
    const elemento = document.getElementById(`agenda-hora-${hora}`);
    if (elemento) {
      elemento.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, []);
  
  // ... resto do componente
}
```

Se a estrutura for diferente (data-hora, ou lista de divs), ajusta o seletor conforme necessário.

- [ ] **Step 7:** Testa manual

```bash
npm run dev
# Abre http://localhost:3000/login, loga, vai pra /agenda
# Verifica: (1) logo maior no sidebar, (2) agenda scrollada pra hora atual
```

- [ ] **Step 8:** Commit

```bash
git add components/SidebarShell.tsx components/AgendaClient.tsx
git commit -m "Aumenta logo 50% e foca agenda no horário atual"
```

---

### Task 2: ModalForm Component

Novo componente reutilizável para envolver form content em glass modal.

**Files:**
- Create: `components/ModalForm.tsx`

**Interfaces:**
- Consumes: React, TypeScript
- Produces: `ModalForm` component exportado

Assinatura:
```typescript
interface ModalFormProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  submitLabel?: string;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  /**
   * React 19 Server Action / client action, passada direto pro `<form action={...}>`
   * nativo. Adicionada depois, na Task 3, quando ficou claro que o codebase usa
   * Server Actions via `useActionState` (não `onSubmit` com `preventDefault`) — é a
   * prop preferida pra forms deste projeto; `onSubmit` continua existindo só pra
   * compatibilidade/uso fora desse padrão.
   */
  action?: (formData: FormData) => void | Promise<void>;
  isLoading?: boolean;
}

export function ModalForm(props: ModalFormProps): React.ReactNode
```

- [ ] **Step 1:** Lê um modal existente para entender o padrão (BloqueioFormularioModal ou AgendaFormularioModal)

```bash
head -100 components/BloqueioFormularioModal.tsx
```

- [ ] **Step 2:** Cria `components/ModalForm.tsx` com estrutura glass + Escape key handler

```typescript
'use client';

import { useEffect } from 'react';

export interface ModalFormProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  submitLabel?: string;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  isLoading?: boolean;
}

export function ModalForm({
  title,
  isOpen,
  onClose,
  children,
  submitLabel = 'Salvar',
  onSubmit,
  isLoading = false,
}: ModalFormProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-8 space-y-6 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="modal-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition"
            aria-label="Fechar"
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg hover:bg-white/10 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? '...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Testa que compila sem erros

```bash
npx tsc --noEmit 2>&1 | grep ModalForm
```

- [ ] **Step 4:** Commit

```bash
git add components/ModalForm.tsx
git commit -m "Novo ModalForm component com glass e a11y"
```

---

### Task 3: Refactor Categoria Client → ModalForm

Substitui modal inline em CategoriaClient.tsx por ModalForm component.

**Files:**
- Modify: `components/CategoriaClient.tsx`

**Interfaces:**
- Consumes: ModalForm (Task 2)
- Produces: CategoriaClient refatorado, mantém mesma funcionalidade

- [ ] **Step 1:** Lê CategoriaClient.tsx, encontra onde o modal é renderizado

```bash
grep -n "fixed inset-0\|glass\|className=" components/CategoriaClient.tsx | head -30
```

- [ ] **Step 2:** Identifica estado do modal (useState showForm, setShowForm)

```bash
grep -n "showForm\|isOpen\|setShow" components/CategoriaClient.tsx | head -10
```

- [ ] **Step 3:** Encontra a div do modal (com `fixed inset-0`) e anota exatamente qual é a estrutura

- [ ] **Step 4:** Adiciona import no topo

```typescript
import { ModalForm } from './ModalForm';
```

- [ ] **Step 5:** Replace a div do modal pelo componente ModalForm

Antes:
```typescript
{showForm && (
  <div className="fixed inset-0 z-50 ...">
    <div className="glass ...">
      <div className="flex justify-between">
        <h2>{editingId ? 'Editar' : 'Nova'} Categoria</h2>
        <button onClick={() => setShowForm(false)}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        {/* form fields */}
      </form>
    </div>
  </div>
)}
```

Depois:
```typescript
<ModalForm
  title={editingId ? 'Editar Categoria' : 'Nova Categoria'}
  isOpen={showForm}
  onClose={() => setShowForm(false)}
  onSubmit={handleSubmit}
  isLoading={isSubmitting}
>
  {/* form fields only, sem wrappers de modal/form/title/buttons */}
</ModalForm>
```

- [ ] **Step 6:** Verifica que form fields (labels, inputs) estão direto dentro do ModalForm, sem divs extras

- [ ] **Step 7:** Testa manual

```bash
npm run dev
# http://localhost:3000/admin → /produtos/categorias → clica "Nova Categoria"
# Verifica: modal abre com glass, Escape fecha, click fora fecha
```

- [ ] **Step 8:** Commit

```bash
git add components/CategoriaClient.tsx
git commit -m "Refatora CategoriaClient para usar ModalForm"
```

---

### Task 4: Refactor Combo Client → ModalForm

Mesmo padrão que Task 3, mas para Combo.

**Files:**
- Modify: `components/ComboClient.tsx`

**Interfaces:**
- Consumes: ModalForm (Task 2)
- Produces: ComboClient refatorado

- [ ] **Step 1:** Lê ComboClient.tsx, identifica modal

```bash
grep -n "fixed inset-0\|showForm" components/ComboClient.tsx | head -10
```

- [ ] **Step 2:** Adiciona import ModalForm

- [ ] **Step 3:** Replace modal inline com ModalForm (mesmo padrão Task 3)

- [ ] **Step 4:** Testa manual

```bash
npm run dev
# /produtos/combos → clica "Novo Combo" → verifica glass modal
```

- [ ] **Step 5:** Commit

```bash
git add components/ComboClient.tsx
git commit -m "Refatora ComboClient para usar ModalForm"
```

---

### Task 5: Refactor Plano Client → ModalForm

Mesmo padrão que Tasks 3-4, mas para Plano.

**Files:**
- Modify: `components/PlanoClient.tsx`

**Interfaces:**
- Consumes: ModalForm (Task 2)
- Produces: PlanoClient refatorado

- [ ] **Step 1-5:** Mesmo que Tasks 3-4

```bash
# Lê, identifica modal, adiciona import, replace, testa, commit
git add components/PlanoClient.tsx
git commit -m "Refatora PlanoClient para usar ModalForm"
```

---

### Task 6: Refactor Produto Client → ModalForm

Mesmo padrão que Tasks 3-5, mas para Produto.

**Files:**
- Modify: `components/ProdutoClient.tsx`

**Interfaces:**
- Consumes: ModalForm (Task 2)
- Produces: ProdutoClient refatorado

- [ ] **Step 1-5:** Mesmo que Tasks 3-5

```bash
# Lê, identifica modal, adiciona import, replace, testa, commit
git add components/ProdutoClient.tsx
git commit -m "Refatora ProdutoClient para usar ModalForm"
```

---

## Testing

Sem lógica nova (é UI refactor + resize). Verificação manual:

**Logo:**
- Visita http://localhost:3000/admin → sidebar mostra logo notavelmente maior (h-12 ≈ 48px vs h-8 ≈ 32px)

**Agenda:**
- Visita http://localhost:3000/agenda → página carrega e timeline/grid já está scrollado mostrando a hora atual

**Forms (4×):**
- /produtos → clica "Novo Produto" → modal com glass
- /produtos/categorias → clica "Novo Categoria" → modal com glass
- /produtos/combos → clica "Novo Combo" → modal com glass
- /produtos/planos → clica "Novo Plano" → modal com glass
- Em qualquer modal: Escape key fecha, click fora fecha, botão X fecha

**Full suite:**
```bash
npm test
```

Expected: 283/283 passing (sem mudança na contagem, nenhum teste quebra)
