export type Role = 'master' | 'user';

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

/**
 * Dados da pessoa sem os blobs cifrados. `tem_cpf` e `tem_rg` são derivados no SQL
 * (`cpf_ct is not null`) para a tela saber se deve oferecer o botão de revelar sem
 * carregar o documento cifrado só para desenhar o formulário.
 */
export type Pessoa = {
  id: string;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  data_nascimento: string | null;
  rg_orgao_expedidor: string | null;
  cnpj: string | null;
  tem_cpf: boolean;
  tem_rg: boolean;
};

/** Linha da grid de usuários: o vínculo mais o telefone, que vive em `pessoas`. */
export type UserComContato = User & {
  pessoa_id: string;
  telefone: string | null;
  data_contratacao: string | null;
  data_demissao: string | null;
};

export type Room = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type RoomCard = Room & {
  credential_count: number;
};

/** Nunca carrega senha em claro. */
export type CredentialRow = {
  id: string;
  room_id: string;
  room_name: string;
  title: string;
  username: string | null;
  url: string | null;
  is_global: boolean;
  owner_id: string;
  owner_name: string;
  updated_at: string;
};

/**
 * Única fonte de verdade das ações de auditoria: o tipo é derivado da constante,
 * nunca o contrário, para que o filtro da tela de auditoria (que itera sobre
 * `AUDIT_ACTIONS`) nunca fique dessincronizado do que o sistema realmente grava.
 */
export const AUDIT_ACTIONS = [
  'login_ok', 'login_fail', 'logout', 'password_change',
  'view', 'copy', 'create', 'update', 'delete', 'restore', 'purge',
  'room_create', 'room_update', 'room_delete',
  'member_add', 'member_remove',
  'module_grant', 'module_revoke',
  'user_create', 'user_update', 'user_reset_password',
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];

/** `tabela` nunca vem de input do usuário — sempre um literal escolhido pelo
 *  próprio código de cada rota (`/cadastros/clientes` chama sempre com
 *  `'clientes'`). Isso é o que torna seguro usar `sql.unsafe(tabela)` em
 *  `lib/db/terceiros.ts` para interpolar o nome da tabela. */
export type TipoTerceiro = 'clientes' | 'fornecedores';

export type Terceiro = {
  id: string;
  nome: string;
  contato_responsavel: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  created_at: string;
};

export type DadosTerceiro = {
  nome: string;
  contato_responsavel: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
};

export type TipoAtributo = 'numero' | 'texto' | 'booleano';

export type AtributoMolde = {
  chave: string;
  rotulo: string;
  tipo: TipoAtributo;
  obrigatorio: boolean;
};

export type CategoriaProduto = {
  id: string;
  nome: string;
  unidade_consumo: string | null;
  atributos_molde: AtributoMolde[];
  ativo: boolean;
};

export type ValorAtributo = string | number | boolean;

export type Produto = {
  id: string;
  categoria_id: string;
  nome: string;
  descricao: string | null;
  atributos: Record<string, ValorAtributo>;
  preco: number;
  ativo: boolean;
  created_at: string;
};

export type DadosProduto = {
  categoria_id: string;
  nome: string;
  descricao: string | null;
  atributos: Record<string, ValorAtributo>;
  preco: number;
  ativo: boolean;
};

export type TipoItemPedido = 'produto' | 'combo';

/** O que o `ItemRepetidor` produz e o que as actions de combo/plano leem do formulário. */
export type ItemEntrada = { tipo: TipoItemPedido; valor: string; quantidade: number };

/** Item já resolvido com nome/estado do produto ou combo referenciado, pra exibição. */
export type ItemResolvido = {
  tipo: TipoItemPedido;
  valor: string;
  nome: string;
  quantidade: number;
  ativo: boolean;
};

export type Combo = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  ativo: boolean;
  created_at: string;
  itens: ItemResolvido[];
};

export type DadosCombo = {
  nome: string;
  descricao: string | null;
  preco: number;
  ativo: boolean;
  itens: ItemEntrada[];
};

export type TipoCobranca = 'pacote_fechado' | 'assinatura';

export type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo_cobranca: TipoCobranca;
  validade_dias: number | null;
  ciclo: 'mensal' | null;
  preco: number;
  ativo: boolean;
  created_at: string;
  itens: ItemResolvido[];
};

export type DadosPlano = {
  nome: string;
  descricao: string | null;
  tipo_cobranca: TipoCobranca;
  validade_dias: number | null;
  ciclo: 'mensal' | null;
  preco: number;
  ativo: boolean;
  itens: ItemEntrada[];
};

export type Estudio = { id: string; local_id: string; nome: string; created_at: string };

export type LocalGravacao = {
  id: string;
  nome: string;
  endereco: string | null;
  responsavel: string | null;
  created_at: string;
  estudios: Estudio[];
};

export type DadosLocal = {
  nome: string;
  endereco: string | null;
  responsavel: string | null;
  /** Com `id` presente: renomeia o estúdio existente. Sem `id`: cria um novo. Um
   *  estúdio existente que não aparece nesta lista é soft-deleted (ver
   *  `lib/db/locais-gravacao.ts`, `updateLocal`). */
  estudios: { id?: string; nome: string }[];
};

export type StatusAgendamento = 'cancelado' | 'agendado' | 'pre_agendado' | 'gravando' | 'concluido';

export type Agendamento = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  local_id: string;
  estudio_id: string;
  estudio_nome: string;
  categoria_produto_id: string;
  categoria_nome: string;
  status: StatusAgendamento;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  created_at: string;
};

export type DadosAgendamento = {
  cliente_id: string;
  local_id: string;
  estudio_id: string;
  categoria_produto_id: string;
  status: StatusAgendamento;
  data: string;
  hora_inicio: string;
  hora_fim: string;
};

export type BloqueioEstudio = {
  id: string;
  estudio_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  motivo: string | null;
  created_at: string;
};

export type DadosBloqueio = {
  estudio_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  motivo: string | null;
};

export type TipoContratacao = 'avulso' | 'combo' | 'plano';

export type ContratacaoItemSaldo = {
  produto_id: string;
  produto_nome: string;
  quantidade_total: number;
  quantidade_consumida: number;
};

export type Contratacao = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  tipo: TipoContratacao;
  produto_id: string | null;
  combo_id: string | null;
  plano_id: string | null;
  item_nome: string;
  quantidade: number;
  preco_total: number;
  data_validade: string | null;
  created_at: string;
  itens: ContratacaoItemSaldo[];
};

export type DadosContratacao = {
  cliente_id: string;
  tipo: TipoContratacao;
  produto_id: string | null;
  combo_id: string | null;
  plano_id: string | null;
  quantidade: number;
};

/** Mesma forma de `Contratacao`, mais `cancelada` — só usado na visão de histórico por
 *  cliente (`listContratacoesDoCliente`), que não filtra `deleted_at`. */
export type ContratacaoDoCliente = Contratacao & { cancelada: boolean };

export type OSItemLinha = {
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  pre_agendar: boolean;
};

export type OrdemServico = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  created_at: string;
  itens: OSItemLinha[];
};

export type DadosOSItem = {
  produto_id: string;
  quantidade: number;
  pre_agendar: boolean;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local_id: string | null;
  estudio_id: string | null;
};

export type DadosOS = {
  cliente_id: string;
  itens: DadosOSItem[];
};
