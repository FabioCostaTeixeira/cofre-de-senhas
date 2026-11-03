import { describe, expect, it } from 'vitest';
import { lerDadosChamado } from '@/lib/chamados-form';

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const COMPLETO = {
  categoriaId: 'cat1', produtoId: 'p1', responsavelId: 'u1', titulo: ' Arrumar login ', descricao: ' detalhes ',
};

describe('lerDadosChamado', () => {
  it('lê os campos com trim', () => {
    expect(lerDadosChamado(formData(COMPLETO))).toEqual({
      categoria_id: 'cat1', produto_id: 'p1', responsavel_id: 'u1', titulo: 'Arrumar login', descricao: 'detalhes',
    });
  });

  it('descrição vazia vira null', () => {
    const r = lerDadosChamado(formData({ ...COMPLETO, descricao: '  ' }));
    expect(r).toMatchObject({ descricao: null });
  });

  it.each([
    ['categoriaId', 'Escolha a categoria.'],
    ['produtoId', 'Escolha o produto.'],
    ['responsavelId', 'Escolha o responsável.'],
    ['titulo', 'Informe o título.'],
  ])('sem %s retorna erro', (campo, erro) => {
    expect(lerDadosChamado(formData({ ...COMPLETO, [campo]: ' ' }))).toEqual({ error: erro });
  });
});
