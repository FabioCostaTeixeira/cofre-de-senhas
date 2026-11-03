import type { DadosChamado } from '@/lib/types';

/** Campos do modal de chamado (criar e editar usam os mesmos nomes). */
export function lerDadosChamado(fd: FormData): DadosChamado | { error: string } {
  const categoria_id = String(fd.get('categoriaId') ?? '').trim();
  if (!categoria_id) return { error: 'Escolha a categoria.' };
  const produto_id = String(fd.get('produtoId') ?? '').trim();
  if (!produto_id) return { error: 'Escolha o produto.' };
  const responsavel_id = String(fd.get('responsavelId') ?? '').trim();
  if (!responsavel_id) return { error: 'Escolha o responsável.' };
  const titulo = String(fd.get('titulo') ?? '').trim();
  if (!titulo) return { error: 'Informe o título.' };
  const descricao = String(fd.get('descricao') ?? '').trim();
  return { categoria_id, produto_id, responsavel_id, titulo, descricao: descricao || null };
}
