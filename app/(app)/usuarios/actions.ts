'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireMaster, requireReadyUser } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { camposEditaveis, podeRevelarDados } from '@/lib/authz';
import { audit } from '@/lib/db/audit';
import { listModulesOfUser, listRoomsOfUser, setUserModules, setUserRooms } from '@/lib/db/queries';
import {
  findPessoaIdByCpf, getPessoa, revelarDocumentos, updateContato, updatePessoa,
} from '@/lib/db/pessoas';
import {
  createUserComPessoa, getUserComContato, listVinculosDaPessoa, setPassword, updateVinculo,
  type VinculoResumo,
} from '@/lib/db/users';
import { soDigitos, validarCnpj, validarCpf } from '@/lib/documentos';
import { MODULES } from '@/lib/modules';
import { isUuid } from '@/lib/validation';
import type { Pessoa, Role, UserComContato } from '@/lib/types';

export type CadastroState = { error?: string; ok?: string; pessoaExistenteId?: string };

export type DadosUsuarioAlvo = {
  usuario: UserComContato;
  pessoa: Pessoa;
  salasDoUsuario: string[];
  modulosDoUsuario: string[];
  vinculos: VinculoResumo[];
};

/**
 * Busca os dados do usuário clicado sob demanda. Sem isso, a grid teria que carregar o
 * cadastro completo de todo mundo na página inicial só para o master poder abrir qualquer
 * um — caro, e pior: um bug anterior aqui carregava os dados do PRÓPRIO ator uma vez e
 * reusava para qualquer linha clicada, fazendo o master editar o alvo com o endereço e
 * conceder ao alvo as salas/módulos de si mesmo.
 */
export async function buscarDadosUsuario(
  userId: string,
): Promise<DadosUsuarioAlvo | { error: string }> {
  const actor = await requireReadyUser();
  if (!isUuid(userId)) return { error: 'Usuário não encontrado.' };

  const escopo = camposEditaveis(actor, userId);
  if (escopo === 'nenhum') return { error: 'Sem permissão.' };

  const usuario = await getUserComContato(userId);
  if (!usuario) return { error: 'Usuário não encontrado.' };

  const pessoa = await getPessoa(usuario.pessoa_id);
  if (!pessoa) return { error: 'Cadastro não encontrado.' };

  const [salasDoUsuario, modulosDoUsuario, vinculos] = await Promise.all([
    listRoomsOfUser(usuario.id),
    listModulesOfUser(usuario.id),
    listVinculosDaPessoa(usuario.pessoa_id),
  ]);

  return { usuario, pessoa, salasDoUsuario, modulosDoUsuario, vinculos };
}

/** `''` vira `null`: campo em branco é ausência de dado, não string vazia no banco. */
function ouNulo(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim();
  return v === '' ? null : v;
}

function lerContato(fd: FormData) {
  const tel = ouNulo(fd, 'telefone');
  const cep = ouNulo(fd, 'cep');
  return {
    telefone: tel ? soDigitos(tel) : null,
    cep: cep ? soDigitos(cep) : null,
    logradouro: ouNulo(fd, 'logradouro'),
    numero: ouNulo(fd, 'numero'),
    complemento: ouNulo(fd, 'complemento'),
    bairro: ouNulo(fd, 'bairro'),
    cidade: ouNulo(fd, 'cidade'),
    uf: ouNulo(fd, 'uf')?.toUpperCase() ?? null,
  };
}

/**
 * Salva o cadastro de um usuário existente. O escopo do que pode ser escrito é
 * decidido no servidor por `camposEditaveis` e o que estiver fora dele é ignorado —
 * o formulário nunca é fonte de autoridade.
 */
export async function salvarCadastro(
  _prev: CadastroState, formData: FormData,
): Promise<CadastroState> {
  const actor = await requireReadyUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return { error: 'Usuário não encontrado.' };

  const escopo = camposEditaveis(actor, id);
  if (escopo === 'nenhum') return { error: 'Você não pode editar este cadastro.' };

  const alvo = await getUserComContato(id);
  if (!alvo) return { error: 'Usuário não encontrado.' };

  const contato = lerContato(formData);

  if (escopo === 'contato') {
    await updateContato(alvo.pessoa_id, contato);
    await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                  metadata: { escopo: 'contato' } });
    revalidatePath('/usuarios');
    return { ok: 'Dados atualizados.' };
  }

  // Daqui para baixo, só master.
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Informe o nome.' };

  const role = String(formData.get('role') ?? 'user') as Role;
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };

  const cpf = ouNulo(formData, 'cpf');
  if (cpf && cpf !== '-' && !validarCpf(cpf)) return { error: 'CPF inválido.' };

  const cnpj = ouNulo(formData, 'cnpj');
  if (cnpj && !validarCnpj(cnpj)) return { error: 'CNPJ inválido.' };

  const salas = formData.getAll('salas').map(String);
  const modulos = formData.getAll('modulos').map(String);
  if (salas.some((s) => !isUuid(s))) return { error: 'Sala inválida na seleção.' };
  if (modulos.some((m) => !MODULES.some((x) => x.key === m))) {
    return { error: 'Módulo inválido na seleção.' };
  }

  // O master não pode mudar o próprio papel nem se desativar: `requireMaster()` relê o
  // usuário do banco a cada request, então isso travaria o /admin sem recuperação.
  let finalRole = role;
  let isActive = formData.get('isActive') === 'on';
  let dataDemissao = ouNulo(formData, 'dataDemissao');
  let aviso = '';
  if (id === actor.id) {
    finalRole = actor.role;
    isActive = true;
    dataDemissao = null;
    aviso = ' O master não pode alterar o próprio papel, se desativar nem se demitir;'
      + ' essa parte da alteração foi ignorada.';
  }

  await updateVinculo({
    id, name, role: finalRole, isActive,
    dataContratacao: ouNulo(formData, 'dataContratacao'),
    dataDemissao,
  });

  await updatePessoa(alvo.pessoa_id, {
    ...contato,
    data_nascimento: ouNulo(formData, 'dataNascimento'),
    cpf,
    rg: ouNulo(formData, 'rg'),
    rg_orgao_expedidor: ouNulo(formData, 'rgOrgao'),
    cnpj,
  });

  await aplicarSalas(actor.id, id, salas);
  await aplicarModulos(actor.id, id, modulos);

  await audit({ actorId: actor.id, action: 'user_update', entityType: 'user', entityId: id,
                metadata: { escopo: 'todos', demitido: Boolean(dataDemissao) } });

  revalidatePath('/usuarios');
  revalidatePath('/admin/salas');
  revalidatePath('/');
  return { ok: `Cadastro atualizado.${aviso}` };
}

async function aplicarSalas(actorId: string, userId: string, salas: string[]): Promise<void> {
  const antes = await listRoomsOfUser(userId);
  await setUserRooms(userId, salas);
  const entraram = salas.filter((s) => !antes.includes(s));
  const sairam = antes.filter((s) => !salas.includes(s));
  if (entraram.length) {
    await audit({ actorId, action: 'member_add', entityType: 'user', entityId: userId,
                  metadata: { salas: entraram } });
  }
  if (sairam.length) {
    await audit({ actorId, action: 'member_remove', entityType: 'user', entityId: userId,
                  metadata: { salas: sairam } });
  }
}

async function aplicarModulos(actorId: string, userId: string, modulos: string[]): Promise<void> {
  const antes = await listModulesOfUser(userId);
  await setUserModules(userId, actorId, modulos);
  const concedidos = modulos.filter((m) => !antes.includes(m));
  const revogados = antes.filter((m) => !modulos.includes(m));
  if (concedidos.length) {
    await audit({ actorId, action: 'module_grant', entityType: 'user', entityId: userId,
                  metadata: { modulos: concedidos } });
  }
  if (revogados.length) {
    await audit({ actorId, action: 'module_revoke', entityType: 'user', entityId: userId,
                  metadata: { modulos: revogados } });
  }
}

/**
 * Cria um vínculo. Se o CPF informado já pertence a alguém, reaproveita a pessoa em vez
 * de falhar — é assim que a readmissão acontece: cadastro antigo vira histórico e o novo
 * nasce limpo, sem herdar salas nem módulos.
 */
export async function criarUsuario(
  _prev: CadastroState, formData: FormData,
): Promise<CadastroState> {
  const actor = await requireMaster();

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const senhaInicial = String(formData.get('senhaInicial') ?? '');
  const role = String(formData.get('role') ?? 'user') as Role;
  const cpf = ouNulo(formData, 'cpf');

  if (!name) return { error: 'Informe o nome.' };
  if (!email) return { error: 'Informe o e-mail.' };
  if (role !== 'master' && role !== 'user') return { error: 'Papel inválido.' };
  if (senhaInicial.length < 10) {
    return { error: 'A senha inicial precisa ter ao menos 10 caracteres.' };
  }
  if (cpf && !validarCpf(cpf)) return { error: 'CPF inválido.' };

  const pessoaExistente = cpf ? await findPessoaIdByCpf(cpf) : null;
  const pessoaId = pessoaExistente ?? randomUUID();
  const userId = randomUUID();

  try {
    await createUserComPessoa({
      userId, pessoaId, pessoaJaExiste: Boolean(pessoaExistente),
      email, name, hash: await hashPassword(senhaInicial), role,
      dataContratacao: ouNulo(formData, 'dataContratacao'),
    });
  } catch (err) {
    // Só a violação de unicidade vira mensagem amigável; qualquer outro erro é
    // relançado, senão uma falha de conexão apareceria disfarçada de duplicidade.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return { error: 'Já existe um vínculo ativo com esse e-mail.' };
    }
    throw err;
  }

  if (cpf && !pessoaExistente) {
    await updatePessoa(pessoaId, {
      ...lerContato(formData),
      data_nascimento: ouNulo(formData, 'dataNascimento'),
      cpf,
      rg: ouNulo(formData, 'rg'),
      rg_orgao_expedidor: ouNulo(formData, 'rgOrgao'),
      cnpj: ouNulo(formData, 'cnpj'),
    });
  }

  await audit({ actorId: actor.id, action: 'user_create', entityType: 'user', entityId: userId,
                metadata: { email, role, readmissao: Boolean(pessoaExistente) } });

  await aplicarSalas(actor.id, userId, formData.getAll('salas').map(String));
  await aplicarModulos(actor.id, userId, formData.getAll('modulos').map(String));

  revalidatePath('/usuarios');
  revalidatePath('/');
  return {
    ok: pessoaExistente
      ? 'Vínculo criado para pessoa já cadastrada. O acesso a salas e módulos não foi herdado.'
      : 'Usuário criado. Ele trocará a senha no primeiro acesso.',
  };
}

/** Revela CPF e RG. Restrito ao dono e ao master, e sempre auditado. */
export async function revelarDocumentosAction(
  userId: string,
): Promise<{ cpf: string | null; rg: string | null } | { error: string }> {
  const actor = await requireReadyUser();
  if (!isUuid(userId)) return { error: 'Usuário não encontrado.' };
  if (!podeRevelarDados(actor, userId)) return { error: 'Sem permissão.' };

  const alvo = await getUserComContato(userId);
  if (!alvo) return { error: 'Usuário não encontrado.' };

  const docs = await revelarDocumentos(alvo.pessoa_id);
  await audit({ actorId: actor.id, action: 'view', entityType: 'user', entityId: userId });
  return docs;
}

/**
 * Autocompleta o endereço pelo CEP. Falha em silêncio de propósito: busca de CEP nunca
 * pode impedir alguém de salvar um cadastro. A chamada sai do servidor para não expor o
 * IP de quem edita a um terceiro.
 */
export async function buscarCep(
  cep: string,
): Promise<{ logradouro: string; bairro: string; cidade: string; uf: string } | null> {
  await requireReadyUser();
  const digitos = soDigitos(cep);
  if (digitos.length !== 8) return null;

  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cep/v2/${digitos}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) return null;
    const dado = (await resposta.json()) as {
      street?: string; neighborhood?: string; city?: string; state?: string;
    };
    return {
      logradouro: dado.street ?? '',
      bairro: dado.neighborhood ?? '',
      cidade: dado.city ?? '',
      uf: dado.state ?? '',
    };
  } catch {
    return null;
  }
}

export async function resetUserPassword(
  _prev: CadastroState, formData: FormData,
): Promise<CadastroState> {
  const actor = await requireMaster();
  const id = String(formData.get('id') ?? '');
  const nova = String(formData.get('novaSenha') ?? '');
  if (!isUuid(id)) return { error: 'Usuário não encontrado.' };
  if (nova.length < 10) return { error: 'A senha precisa ter ao menos 10 caracteres.' };

  await setPassword(id, await hashPassword(nova), true);
  await audit({
    actorId: actor.id, action: 'user_reset_password', entityType: 'user', entityId: id,
  });
  revalidatePath('/usuarios');
  return { ok: 'Senha redefinida. O usuário trocará no próximo acesso.' };
}
