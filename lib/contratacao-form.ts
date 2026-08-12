import type { DadosContratacao, TipoContratacao } from '@/lib/types';

export function lerDadosContratacao(fd: FormData): DadosContratacao | { error: string } {
  const cliente_id = String(fd.get('clienteId') ?? '');
  if (!cliente_id) return { error: 'Escolha o cliente.' };

  const tipoBruto = String(fd.get('tipo') ?? '');
  if (tipoBruto !== 'avulso' && tipoBruto !== 'combo' && tipoBruto !== 'plano') {
    return { error: 'Escolha o tipo de contratação.' };
  }
  const tipo = tipoBruto as TipoContratacao;

  const quantidadeBruta = String(fd.get('quantidade') ?? '').trim();
  const quantidade = Number(quantidadeBruta);
  if (!quantidadeBruta || !Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: 'Quantidade precisa ser um número inteiro maior que zero.' };
  }

  if (tipo === 'avulso') {
    const produto_id = String(fd.get('produtoId') ?? '');
    if (!produto_id) return { error: 'Escolha o produto.' };
    return { cliente_id, tipo, produto_id, combo_id: null, plano_id: null, quantidade };
  }
  if (tipo === 'combo') {
    const combo_id = String(fd.get('comboId') ?? '');
    if (!combo_id) return { error: 'Escolha o combo.' };
    return { cliente_id, tipo, produto_id: null, combo_id, plano_id: null, quantidade };
  }
  const plano_id = String(fd.get('planoId') ?? '');
  if (!plano_id) return { error: 'Escolha o plano.' };
  return { cliente_id, tipo, produto_id: null, combo_id: null, plano_id, quantidade };
}
