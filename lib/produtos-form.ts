import type {
  AtributoMolde, CategoriaProduto, DadosCombo, DadosPlano, DadosProduto, ItemEntrada,
  TipoAtributo, ValorAtributo,
} from '@/lib/types';

const TIPOS_ATRIBUTO: TipoAtributo[] = ['numero', 'texto', 'booleano'];

export function lerMoldeAtributos(json: string): AtributoMolde[] | { error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { error: 'Molde de atributos inválido.' };
  }
  if (!Array.isArray(bruto)) return { error: 'Molde de atributos inválido.' };

  const chaves = new Set<string>();
  const molde: AtributoMolde[] = [];
  for (const item of bruto) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).chave !== 'string' ||
      typeof (item as Record<string, unknown>).rotulo !== 'string' ||
      typeof (item as Record<string, unknown>).tipo !== 'string' ||
      typeof (item as Record<string, unknown>).obrigatorio !== 'boolean'
    ) {
      return { error: 'Molde de atributos inválido.' };
    }
    const { chave, rotulo, tipo, obrigatorio } = item as {
      chave: string; rotulo: string; tipo: string; obrigatorio: boolean;
    };
    const chaveNormalizada = chave.trim();
    if (!chaveNormalizada) return { error: 'Todo atributo precisa de uma chave.' };
    if (chaves.has(chaveNormalizada)) {
      return { error: `Chave "${chaveNormalizada}" duplicada no molde.` };
    }
    if (!TIPOS_ATRIBUTO.includes(tipo as TipoAtributo)) return { error: `Tipo "${tipo}" inválido.` };
    chaves.add(chaveNormalizada);
    molde.push({
      chave: chaveNormalizada, rotulo: rotulo.trim() || chaveNormalizada,
      tipo: tipo as TipoAtributo, obrigatorio,
    });
  }
  return molde;
}

export function lerDadosCategoria(
  fd: FormData,
): Omit<CategoriaProduto, 'id'> | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const molde = lerMoldeAtributos(String(fd.get('atributosMolde') ?? '[]'));
  if ('error' in molde) return molde;

  const unidade = String(fd.get('unidadeConsumo') ?? '').trim();
  return { nome, unidade_consumo: unidade || null, atributos_molde: molde, ativo: fd.get('ativo') === 'on' };
}

function lerValorAtributo(
  fd: FormData, campo: AtributoMolde,
): ValorAtributo | null | { error: string } {
  const chave = `attr_${campo.chave}`;
  if (campo.tipo === 'booleano') return fd.get(chave) === 'on';

  const bruto = String(fd.get(chave) ?? '').trim();
  if (!bruto) {
    if (campo.obrigatorio) return { error: `Informe "${campo.rotulo}".` };
    return null;
  }
  if (campo.tipo === 'numero') {
    const num = Number(bruto);
    if (Number.isNaN(num)) return { error: `"${campo.rotulo}" precisa ser um número.` };
    return num;
  }
  return bruto;
}

/**
 * Aceita tanto número puro ("399") quanto o valor já mascarado pelo campo de
 * preço ("R$ 1.234,56") — descarta tudo que não for dígito ou vírgula antes de
 * interpretar a vírgula como separador decimal.
 */
function lerPreco(fd: FormData): number | { error: string } {
  const limpo = String(fd.get('preco') ?? '').replace(/[^0-9,]/g, '');
  const preco = limpo === '' ? NaN : Number(limpo.replace(',', '.'));
  if (Number.isNaN(preco) || preco < 0) return { error: 'Preço inválido.' };
  return preco;
}

export function lerDadosProduto(
  fd: FormData, molde: AtributoMolde[],
): DadosProduto | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const categoria_id = String(fd.get('categoriaId') ?? '');
  if (!categoria_id) return { error: 'Escolha a categoria.' };

  const preco = lerPreco(fd);
  if (typeof preco === 'object') return preco;

  const atributos: Record<string, ValorAtributo> = {};
  for (const campo of molde) {
    const valor = lerValorAtributo(fd, campo);
    if (valor !== null && typeof valor === 'object' && 'error' in valor) return valor;
    if (valor !== null) atributos[campo.chave] = valor;
  }

  const descricao = String(fd.get('descricao') ?? '').trim();
  return {
    categoria_id, nome, descricao: descricao || null, atributos, preco,
    ativo: fd.get('ativo') === 'on',
  };
}

function lerItens(json: string, tiposAceitos: ItemEntrada['tipo'][]): ItemEntrada[] | { error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { error: 'Itens inválidos.' };
  }
  if (!Array.isArray(bruto) || bruto.length === 0) return { error: 'Adicione pelo menos um item.' };

  const itens: ItemEntrada[] = [];
  for (const item of bruto) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).tipo !== 'string' ||
      typeof (item as Record<string, unknown>).valor !== 'string' ||
      typeof (item as Record<string, unknown>).quantidade !== 'number'
    ) {
      return { error: 'Itens inválidos.' };
    }
    const { tipo, valor, quantidade } = item as ItemEntrada;
    if (!tiposAceitos.includes(tipo)) return { error: 'Itens inválidos.' };
    if (quantidade <= 0) return { error: 'Quantidade precisa ser maior que zero.' };
    itens.push({ tipo, valor, quantidade });
  }
  return mesclarItensDuplicados(itens);
}

/**
 * Combos/planos têm uma constraint `unique (combo_id, produto_id)` (e o `plano_itens`
 * seria naturalmente equivalente, mesmo sem constraint declarada) — adicionar o mesmo
 * item duas vezes pelo `ItemRepetidor` não deveria virar erro nem duplicar linha no
 * banco. Mescla entradas com o mesmo tipo+valor somando a quantidade, preservando a
 * ordem da primeira aparição de cada uma.
 */
function mesclarItensDuplicados(itens: ItemEntrada[]): ItemEntrada[] {
  const mescladas = new Map<string, ItemEntrada>();
  for (const item of itens) {
    const chave = `${item.tipo}:${item.valor}`;
    const existente = mescladas.get(chave);
    if (existente) existente.quantidade += item.quantidade;
    else mescladas.set(chave, { ...item });
  }
  return [...mescladas.values()];
}

export function lerItensCombo(json: string): ItemEntrada[] | { error: string } {
  const itens = lerItens(json, ['produto']);
  return 'error' in itens && itens.error === 'Itens inválidos.'
    ? { error: 'Itens do combo inválidos.' }
    : itens;
}

export function lerItensPlano(json: string): ItemEntrada[] | { error: string } {
  return lerItens(json, ['produto', 'combo']);
}

export function lerDadosCombo(fd: FormData): DadosCombo | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const preco = lerPreco(fd);
  if (typeof preco === 'object') return preco;

  const itens = lerItensCombo(String(fd.get('itens') ?? '[]'));
  if ('error' in itens) return itens;

  const descricao = String(fd.get('descricao') ?? '').trim();
  return { nome, descricao: descricao || null, preco, ativo: fd.get('ativo') === 'on', itens };
}

export function lerDadosPlano(fd: FormData): DadosPlano | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const tipo_cobranca = String(fd.get('tipoCobranca') ?? '');
  if (tipo_cobranca !== 'pacote_fechado' && tipo_cobranca !== 'assinatura') {
    return { error: 'Escolha o tipo de cobrança.' };
  }

  let validade_dias: number | null = null;
  let ciclo: 'mensal' | null = null;
  if (tipo_cobranca === 'pacote_fechado') {
    const bruto = String(fd.get('validadeDias') ?? '').trim();
    const num = Number(bruto);
    if (!bruto || Number.isNaN(num) || num <= 0) return { error: 'Informe a validade em dias.' };
    validade_dias = num;
  } else {
    ciclo = 'mensal';
  }

  const preco = lerPreco(fd);
  if (typeof preco === 'object') return preco;

  const itens = lerItensPlano(String(fd.get('itens') ?? '[]'));
  if ('error' in itens) return itens;

  const descricao = String(fd.get('descricao') ?? '').trim();
  return {
    nome, descricao: descricao || null, tipo_cobranca, validade_dias, ciclo, preco,
    ativo: fd.get('ativo') === 'on', itens,
  };
}
