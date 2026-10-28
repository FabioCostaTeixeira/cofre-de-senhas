import type { CategoriaProduto } from '@/lib/types';

type CategoriaRegra = Pick<CategoriaProduto, 'id' | 'produtos_exclusivos'>;

/**
 * Quais produtos o item da OS oferece depois de escolhida a categoria: a escolhida
 * sendo exclusiva (Cortes), só os produtos dela; senão, todos os de categorias não
 * exclusivas. Usada no select do formulário e na validação do servidor.
 */
export function produtoPermitidoNaCategoria(
  categoriaDoProduto: CategoriaRegra, escolhida: CategoriaRegra,
): boolean {
  if (escolhida.produtos_exclusivos) return categoriaDoProduto.id === escolhida.id;
  return !categoriaDoProduto.produtos_exclusivos;
}
