import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { FiltroChamados } from '@/components/FiltroChamados';

afterEach(() => cleanup());

describe('FiltroChamados', () => {
  it('é uma caixa só, com as três opções e a atual selecionada', () => {
    render(<FiltroChamados atual="designados" base="/working/projetos?visao=individual&" />);
    const select = screen.getByRole('combobox', { name: 'Filtrar chamados' }) as HTMLSelectElement;
    expect(select.value).toBe('designados');
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Todos', 'Abertos por mim', 'Designados a mim']);
  });

  it('escolher uma opção navega mantendo a visão', () => {
    render(<FiltroChamados atual="designados" base="/working/projetos?visao=individual&" />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar chamados' }), { target: { value: 'abertos' } });
    expect(push).toHaveBeenCalledWith('/working/projetos?visao=individual&filtro=abertos');
  });
});
