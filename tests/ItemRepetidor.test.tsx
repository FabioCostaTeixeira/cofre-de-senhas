import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { calcularSomaItens, ItemRepetidor, type OpcaoItem } from '@/components/ItemRepetidor';

const opcoes: OpcaoItem[] = [
  { tipo: 'produto', valor: 'p1', rotulo: 'Corte editado', preco: 199 },
  { tipo: 'combo', valor: 'c1', rotulo: 'Combo X', preco: 500 },
];

afterEach(() => cleanup());

describe('calcularSomaItens', () => {
  it('soma preço × quantidade de cada item', () => {
    const soma = calcularSomaItens([{ tipo: 'produto', valor: 'p1', quantidade: 4 }], opcoes);
    expect(soma).toBe(796);
  });
});

describe('ItemRepetidor', () => {
  it('adicionar item chama onChange com o item novo', () => {
    const onChange = vi.fn();
    render(<ItemRepetidor nomeCampo="itens" opcoes={opcoes} itens={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Adicionar'));
    expect(onChange).toHaveBeenCalledWith([{ tipo: 'produto', valor: 'p1', quantidade: 1 }]);
  });

  it('remover item chama onChange sem ele', () => {
    const onChange = vi.fn();
    render(
      <ItemRepetidor
        nomeCampo="itens" opcoes={opcoes} onChange={onChange}
        itens={[{ tipo: 'produto', valor: 'p1', quantidade: 2 }]}
      />,
    );
    fireEvent.click(screen.getByText('Remover'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
