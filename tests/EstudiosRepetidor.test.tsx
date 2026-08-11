import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EstudiosRepetidor } from '@/components/EstudiosRepetidor';

afterEach(() => cleanup());

describe('EstudiosRepetidor', () => {
  it('adicionar um nome novo chama onChange com o item incluído', () => {
    const onChange = vi.fn();
    render(<EstudiosRepetidor itens={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Estúdio'), { target: { value: 'Estúdio A' } });
    fireEvent.click(screen.getByText('Adicionar'));

    expect(onChange).toHaveBeenCalledWith([{ nome: 'Estúdio A' }]);
  });

  it('remover um item preserva o id dos que restaram', () => {
    const onChange = vi.fn();
    const itens = [{ id: 'e1', nome: 'Estúdio A' }, { id: 'e2', nome: 'Estúdio B' }];
    render(<EstudiosRepetidor itens={itens} onChange={onChange} />);

    fireEvent.click(screen.getAllByText('Remover')[0]);

    expect(onChange).toHaveBeenCalledWith([{ id: 'e2', nome: 'Estúdio B' }]);
  });

  it('sem itens mostra mensagem vazia', () => {
    render(<EstudiosRepetidor itens={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Nenhum estúdio adicionado.')).toBeInTheDocument();
  });
});
