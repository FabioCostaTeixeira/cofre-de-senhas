/**
 * Teste de integração contra um banco Postgres real (Neon).
 *
 * Só roda quando `DATABASE_URL` e `VAULT_KEY` estão no ambiente — em CI sem banco,
 * a suíte inteira é pulada em vez de falhar. Rode com:
 *   npx vitest run tests/integracao.test.ts
 *
 * Ele cria os próprios dados com um prefixo único e apaga tudo ao final, para poder
 * rodar repetidamente contra o mesmo banco sem sujar o cofre.
 */
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

config({ path: '.env.local' });
config();

const temBanco = Boolean(process.env.DATABASE_URL && process.env.VAULT_KEY);
const descreve = temBanco ? describe : describe.skip;

const marca = `teste-${Date.now()}`;

descreve('integração com o banco real', () => {
  let sql: typeof import('@/lib/db/client')['sql'];
  let q: typeof import('@/lib/db/queries');
  let masterId: string;
  let comumId: string;
  let estranhoId: string;
  let salaId: string;
  const pessoaIds: string[] = [];

  type Ator = import('@/lib/types').Actor;
  let master: Ator;
  let comum: Ator;
  let estranho: Ator;

  beforeAll(async () => {
    sql = (await import('@/lib/db/client')).sql;
    q = await import('@/lib/db/queries');

    const cria = async (email: string, role: 'master' | 'user') => {
      const pessoaId = randomUUID();
      await sql`insert into pessoas (id) values (${pessoaId})`;
      pessoaIds.push(pessoaId);
      const linhas = (await sql`
        insert into users (email, name, password_hash, role, must_change_password, pessoa_id)
        values (${`${marca}-${email}`}, ${email}, 'nao-usado', ${role}, false, ${pessoaId})
        returning id`) as { id: string }[];
      return linhas[0].id;
    };

    masterId = await cria('master', 'master');
    comumId = await cria('comum', 'user');
    estranhoId = await cria('estranho', 'user');

    const ator = (id: string, nome: string, role: 'master' | 'user'): Ator => ({
      id, email: `${marca}-${nome}`, name: nome, role, mustChangePassword: false,
    });
    master = ator(masterId, 'master', 'master');
    comum = ator(comumId, 'comum', 'user');
    estranho = ator(estranhoId, 'estranho', 'user');

    salaId = await q.createRoom(masterId, `${marca}-sala`, 'sala de teste');
    await q.setRoomMembers(salaId, [comumId]);
  });

  afterAll(async () => {
    if (!temBanco) return;
    await sql`delete from credentials where room_id = ${salaId}`;
    await sql`delete from room_members where room_id = ${salaId}`;
    await sql`delete from rooms where id = ${salaId}`;
    await sql`delete from audit_log where actor_id in (${masterId}, ${comumId}, ${estranhoId})`;
    await sql`delete from users where id in (${masterId}, ${comumId}, ${estranhoId})`;
    await sql`delete from pessoas where id = any(${pessoaIds})`;
  });

  it('cifra e devolve a senha em claro só para quem pode ver', async () => {
    const id = await q.insertCredential(comum, {
      roomId: salaId, title: `${marca}-global`, username: 'usuario@x.com',
      password: 'senha-super-secreta', url: 'https://exemplo.com',
      notes: 'nota confidencial', isGlobal: true,
    });

    // O ciphertext no banco não contém o texto claro.
    const linhas = (await sql`
      select password_ct from credentials where id = ${id}`) as { password_ct: Buffer }[];
    expect(Buffer.from(linhas[0].password_ct).toString('utf8')).not.toContain('senha-super');

    expect(await q.revealPassword(comum, id)).toBe('senha-super-secreta');
    expect(await q.revealPassword(master, id)).toBe('senha-super-secreta');
    await expect(q.revealPassword(estranho, id)).rejects.toThrow();
  });

  it('esconde a senha pessoal de terceiro, mas não do dono nem do master', async () => {
    const id = await q.insertCredential(comum, {
      roomId: salaId, title: `${marca}-pessoal`, username: 'so-meu',
      password: 'segredo-pessoal', url: '', notes: '', isGlobal: false,
    });

    const doDono = await q.listCredentials(comum, salaId, '');
    expect(doDono.map((c) => c.id)).toContain(id);

    const doMaster = await q.listCredentials(master, salaId, '');
    expect(doMaster.map((c) => c.id)).toContain(id);

    await expect(q.listCredentials(estranho, salaId, '')).rejects.toThrow();
    await expect(q.revealPassword(estranho, id)).rejects.toThrow();
  });

  it('preserva as notas ao editar sem alterar a senha', async () => {
    const id = await q.insertCredential(comum, {
      roomId: salaId, title: `${marca}-notas`, username: 'u',
      password: 'senha-original', url: '', notes: 'anotação importante', isGlobal: true,
    });

    const antes = await q.getCredentialForEdit(comum, id);
    expect(antes.notes).toBe('anotação importante');

    await q.updateCredential(comum, id, {
      roomId: salaId, title: `${marca}-notas-editada`, username: 'u',
      password: '', url: '', notes: antes.notes, isGlobal: true,
    });

    expect(await q.revealPassword(comum, id)).toBe('senha-original');
    expect((await q.getCredentialForEdit(comum, id)).notes).toBe('anotação importante');
  });

  it('busca por nome, usuário e url', async () => {
    const achados = await q.searchAllCredentials(comum, `${marca}-global`);
    expect(achados.length).toBeGreaterThan(0);
    expect(achados[0].room_name).toBe(`${marca}-sala`);

    expect(await q.searchAllCredentials(estranho, marca)).toHaveLength(0);
  });

  it('lixeira: apagar tira da listagem e restaurar traz de volta', async () => {
    const id = await q.insertCredential(comum, {
      roomId: salaId, title: `${marca}-lixo`, username: '', password: 'x',
      url: '', notes: '', isGlobal: true,
    });

    await q.softDeleteCredential(comum, id);
    const depois = await q.listCredentials(comum, salaId, '');
    expect(depois.map((c) => c.id)).not.toContain(id);
    await expect(q.revealPassword(comum, id)).rejects.toThrow();

    const lixo = await q.listTrash();
    expect(lixo.map((i) => i.id)).toContain(id);

    await q.restoreItem('credential', id);
    const restaurada = await q.listCredentials(comum, salaId, '');
    expect(restaurada.map((c) => c.id)).toContain(id);
  });

  it('sala na lixeira corta o acesso por id direto', async () => {
    const id = await q.insertCredential(comum, {
      roomId: salaId, title: `${marca}-sala-apagada`, username: '', password: 'y',
      url: '', notes: '', isGlobal: true,
    });

    await q.softDeleteRoom(salaId);
    try {
      await expect(q.revealPassword(comum, id)).rejects.toThrow();
      expect(await q.listRoomsForActor(comum)).toHaveLength(0);
      expect(await q.searchAllCredentials(comum, marca)).toHaveLength(0);
    } finally {
      await q.restoreItem('room', salaId);
    }

    expect(await q.revealPassword(comum, id)).toBe('y');
  });

  it('id malformado vira "não encontrado", não erro de banco', async () => {
    await expect(q.revealPassword(comum, 'nao-e-uuid')).rejects.toThrow(/não encontrad/i);
    await expect(q.getRoomForActor(comum, 'nao-e-uuid')).rejects.toThrow(/não encontrad/i);
  });

  it('grava auditoria sem deixar segredo passar no metadata', async () => {
    const { audit } = await import('@/lib/db/audit');
    await audit({
      actorId: comumId, action: 'view', entityType: 'credential',
      metadata: { titulo: 'ok', senha: 'nao-pode-passar', apiToken: 'nem-isso' },
    });

    const linhas = (await sql`
      select metadata from audit_log where actor_id = ${comumId} and action = 'view'
       order by created_at desc limit 1`) as { metadata: Record<string, unknown> }[];
    expect(linhas[0].metadata).toEqual({ titulo: 'ok' });
  });

  it('conta na sala e cards batem com o que o ator pode ver', async () => {
    const salasDoComum = await q.listRoomsForActor(comum);
    const salaDoComum = salasDoComum.find((s) => s.id === salaId);
    const vistas = await q.listCredentials(comum, salaId, '');
    expect(salaDoComum?.credential_count).toBe(vistas.length);

    expect(await q.listRoomsForActor(estranho)).toHaveLength(0);
  });

  it('compartilha a senha restrita com quem o dono escolher', async () => {
    // Um segundo membro comum na mesma sala, para receber o compartilhamento.
    const colegaPessoaId = randomUUID();
    await sql`insert into pessoas (id) values (${colegaPessoaId})`;
    const linhas = (await sql`
      insert into users (email, name, password_hash, role, must_change_password, pessoa_id)
      values (${`${marca}-colega`}, 'colega', 'nao-usado', 'user', false, ${colegaPessoaId})
      returning id`) as { id: string }[];
    const colegaId = linhas[0].id;
    const colega: Ator = {
      id: colegaId, email: `${marca}-colega`, name: 'colega', role: 'user',
      mustChangePassword: false,
    };
    await q.setUserRooms(colegaId, [salaId]);

    const id = await q.insertCredential(comum, {
      roomId: salaId, title: `${marca}-restrita`, username: 'u', password: 'segredo-restrito',
      url: '', notes: '', isGlobal: false, compartilharCom: [colegaId],
    });

    try {
      // Quem recebeu vê e revela.
      expect((await q.listCredentials(colega, salaId, '')).map((c) => c.id)).toContain(id);
      expect(await q.revealPassword(colega, id)).toBe('segredo-restrito');
      expect((await q.searchAllCredentials(colega, marca)).map((c) => c.id)).toContain(id);

      // Mas não pode editar nem apagar.
      await expect(q.getCredentialForEdit(colega, id)).rejects.toThrow();
      await expect(q.softDeleteCredential(colega, id)).rejects.toThrow();

      // Quem não recebeu, mesmo sendo membro da sala, não vê.
      await q.setUserRooms(estranhoId, [salaId]);
      const estranhoNaSala: Ator = { ...estranho };
      expect((await q.listCredentials(estranhoNaSala, salaId, '')).map((c) => c.id))
        .not.toContain(id);
      await expect(q.revealPassword(estranhoNaSala, id)).rejects.toThrow();
      await q.setUserRooms(estranhoId, []);

      // Tirar do compartilhamento revoga o acesso.
      await q.updateCredential(comum, id, {
        roomId: salaId, title: `${marca}-restrita`, username: 'u', password: '',
        url: '', notes: '', isGlobal: false, compartilharCom: [],
      });
      await expect(q.revealPassword(colega, id)).rejects.toThrow();

      // Virar global libera para a sala inteira e limpa a lista.
      await q.updateCredential(comum, id, {
        roomId: salaId, title: `${marca}-restrita`, username: 'u', password: '',
        url: '', notes: '', isGlobal: true, compartilharCom: [colegaId],
      });
      expect(await q.listCredentialShares(id)).toHaveLength(0);
      expect(await q.revealPassword(colega, id)).toBe('segredo-restrito');
    } finally {
      await sql`delete from credential_shares where user_id = ${colegaId}`;
      await sql`delete from room_members where user_id = ${colegaId}`;
      await sql`delete from users where id = ${colegaId}`;
      await sql`delete from pessoas where id = ${colegaPessoaId}`;
    }
  });

  describe('module_access', () => {
    it('concede e lista módulos de um usuário', async () => {
      await q.setUserModules(comumId, masterId, ['gestao']);
      expect(await q.listModulesOfUser(comumId)).toEqual(['gestao']);
    });

    it('substitui o conjunto: remove o que saiu, mantém o que ficou', async () => {
      await q.setUserModules(comumId, masterId, ['gestao']);
      await q.setUserModules(comumId, masterId, []);
      expect(await q.listModulesOfUser(comumId)).toEqual([]);
    });

    it('usuário sem módulo concedido não vê nenhum', async () => {
      expect(await q.listModulesOfUser(estranhoId)).toEqual([]);
    });
  });

  describe('cadastro de pessoa e vínculo', () => {
    const usersCriados: string[] = [];
    const pessoasCriadas: string[] = [];

    afterAll(async () => {
      if (!temBanco) return;
      if (usersCriados.length > 0) {
        await sql`delete from users where id = any(${usersCriados})`;
      }
      if (pessoasCriadas.length > 0) {
        await sql`delete from pessoas where id = any(${pessoasCriadas})`;
      }
    });

    it('gravar data de demissão desativa o acesso na mesma transação', async () => {
      const u = await import('@/lib/db/users');
      const id = randomUUID();
      const pessoaId = randomUUID();
      usersCriados.push(id);
      pessoasCriadas.push(pessoaId);
      await u.createUserComPessoa({
        userId: id, pessoaId, pessoaJaExiste: false,
        email: `${marca}-dem@x.com`, name: 'Demitido',
        hash: 'x', role: 'user', dataContratacao: '2020-01-01',
      });

      await u.updateVinculo({
        id, name: 'Demitido', role: 'user', isActive: true,
        dataContratacao: '2020-01-01', dataDemissao: '2026-08-06',
      });

      const linha = (await sql`select is_active from users where id = ${id}`) as
        { is_active: boolean }[];
      expect(linha[0].is_active).toBe(false);
    });

    it('CPF duplicado em pessoas é rejeitado pelo índice único', async () => {
      const p = await import('@/lib/db/pessoas');
      const a = randomUUID();
      const b = randomUUID();
      pessoasCriadas.push(a, b);
      await sql`insert into pessoas (id) values (${a})`;
      await sql`insert into pessoas (id) values (${b})`;

      await p.updatePessoa(a, {
        telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
        bairro: null, cidade: null, uf: null, data_nascimento: null,
        cpf: '529.982.247-25', rg: null, rg_orgao_expedidor: null, cnpj: null,
      });

      await expect(p.updatePessoa(b, {
        telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
        bairro: null, cidade: null, uf: null, data_nascimento: null,
        cpf: '52998224725', rg: null, rg_orgao_expedidor: null, cnpj: null,
      })).rejects.toMatchObject({ code: '23505' });
    });

    it('ida e volta do CPF cifrado devolve o valor original', async () => {
      const p = await import('@/lib/db/pessoas');
      const id = randomUUID();
      pessoasCriadas.push(id);
      await sql`insert into pessoas (id) values (${id})`;
      await p.updatePessoa(id, {
        telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
        bairro: null, cidade: null, uf: null, data_nascimento: null,
        cpf: '111.444.777-35', rg: 'MG-12.345.678', rg_orgao_expedidor: 'SSP/MG', cnpj: null,
      });

      const docs = await p.revelarDocumentos(id);
      expect(docs.cpf).toBe('11144477735');
      expect(docs.rg).toBe('MG-12.345.678');
    });

    it('AAD trocado impede ler o CPF como se fosse RG', async () => {
      const { decrypt } = await import('@/lib/crypto');
      const id = randomUUID();
      pessoasCriadas.push(id);
      await sql`insert into pessoas (id) values (${id})`;
      const p = await import('@/lib/db/pessoas');
      // CPF diferente do usado no teste de ida-e-volta: mesmo hmac colidiria com o
      // índice único de `pessoas.cpf_hmac` porque a limpeza só roda no `afterAll`.
      await p.updatePessoa(id, {
        telefone: null, cep: null, logradouro: null, numero: null, complemento: null,
        bairro: null, cidade: null, uf: null, data_nascimento: null,
        cpf: '123.456.789-09', rg: null, rg_orgao_expedidor: null, cnpj: null,
      });

      const linha = (await sql`
        select cpf_ct, cpf_iv, cpf_tag from pessoas where id = ${id}`) as
        { cpf_ct: Buffer; cpf_iv: Buffer; cpf_tag: Buffer }[];

      expect(() => decrypt(
        { ct: linha[0].cpf_ct, iv: linha[0].cpf_iv, tag: linha[0].cpf_tag },
        `${id}:rg`,
      )).toThrow();
    });

    it('readmissão: reusa o e-mail e findUserByEmail devolve o vínculo atual', async () => {
      const u = await import('@/lib/db/users');
      const email = `${marca}-readmitido@x.com`;
      const pessoaId = randomUUID();
      const antigo = randomUUID();
      const novo = randomUUID();
      pessoasCriadas.push(pessoaId);
      usersCriados.push(antigo, novo);

      await u.createUserComPessoa({
        userId: antigo, pessoaId, pessoaJaExiste: false,
        email, name: 'Primeira passagem', hash: 'x', role: 'user',
        dataContratacao: '2020-01-01',
      });
      await u.updateVinculo({
        id: antigo, name: 'Primeira passagem', role: 'user', isActive: true,
        dataContratacao: '2020-01-01', dataDemissao: '2022-06-30',
      });

      // Só é possível porque o unique de e-mail é parcial (`where data_demissao is null`).
      await u.createUserComPessoa({
        userId: novo, pessoaId, pessoaJaExiste: true,
        email, name: 'Segunda passagem', hash: 'x', role: 'user',
        dataContratacao: '2026-08-06',
      });

      const achado = await u.findUserByEmail(email);
      expect(achado?.id).toBe(novo);

      const vinculos = await u.listVinculosDaPessoa(pessoaId);
      expect(vinculos).toHaveLength(2);
    });

    it('dois vínculos ativos com o mesmo e-mail continuam sendo rejeitados', async () => {
      const u = await import('@/lib/db/users');
      const email = `${marca}-dup@x.com`;
      const idA = randomUUID();
      const pessoaIdA = randomUUID();
      const idB = randomUUID();
      const pessoaIdB = randomUUID();
      usersCriados.push(idA);
      pessoasCriadas.push(pessoaIdA, pessoaIdB);
      await u.createUserComPessoa({
        userId: idA, pessoaId: pessoaIdA, pessoaJaExiste: false,
        email, name: 'A', hash: 'x', role: 'user', dataContratacao: null,
      });

      await expect(u.createUserComPessoa({
        userId: idB, pessoaId: pessoaIdB, pessoaJaExiste: false,
        email, name: 'B', hash: 'x', role: 'user', dataContratacao: null,
      })).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('cria, edita e apaga (soft) um cliente', async () => {
    const terceiros = await import('@/lib/db/terceiros');

    const id = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente`, contato_responsavel: 'Fulano', email: 'f@x.com',
      telefone: '11987654321', cidade: 'São Paulo', uf: 'SP',
    });

    const criado = await terceiros.getTerceiro('clientes', id);
    expect(criado?.nome).toBe(`${marca}-cliente`);
    expect((await terceiros.listTerceiros('clientes')).map((c) => c.id)).toContain(id);

    await terceiros.updateTerceiro('clientes', id, {
      nome: `${marca}-cliente-editado`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    expect((await terceiros.getTerceiro('clientes', id))?.nome).toBe(`${marca}-cliente-editado`);

    await terceiros.softDeleteTerceiro('clientes', id);
    expect(await terceiros.getTerceiro('clientes', id)).toBeNull();
    expect((await terceiros.listTerceiros('clientes')).map((c) => c.id)).not.toContain(id);

    await sql`delete from clientes where id = ${id}`;
  });

  it('cria e apaga (soft) um fornecedor, mesma forma da tabela de clientes', async () => {
    const terceiros = await import('@/lib/db/terceiros');

    const id = await terceiros.createTerceiro('fornecedores', {
      nome: `${marca}-fornecedor`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });

    expect((await terceiros.getTerceiro('fornecedores', id))?.nome).toBe(`${marca}-fornecedor`);

    await terceiros.softDeleteTerceiro('fornecedores', id);
    expect(await terceiros.getTerceiro('fornecedores', id)).toBeNull();

    await sql`delete from fornecedores where id = ${id}`;
  });

  it('cliente apagado aparece na lixeira, restaura e depois expurga', async () => {
    const terceiros = await import('@/lib/db/terceiros');

    const id = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-lixeira`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    await terceiros.softDeleteTerceiro('clientes', id);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'cliente' && i.id === id);
    expect(item?.title).toBe(`${marca}-lixeira`);

    await q.restoreItem('cliente', id);
    expect(await terceiros.getTerceiro('clientes', id)).not.toBeNull();

    await terceiros.softDeleteTerceiro('clientes', id);
    await q.purgeItem('cliente', id);
    const linhas = (await sql`select id from clientes where id = ${id}`) as { id: string }[];
    expect(linhas).toHaveLength(0);
  });

  it('categoria: cria, edita e apaga quando não está em uso', async () => {
    const cat = await import('@/lib/db/categorias-produto');

    const id = await cat.createCategoria({
      nome: `${marca}-categoria`, unidade_consumo: 'gravação',
      atributos_molde: [{ chave: 'qtd_cameras', rotulo: 'Câmeras', tipo: 'numero', obrigatorio: true }],
      ativo: true,
    });

    const criada = await cat.getCategoria(id);
    expect(criada?.nome).toBe(`${marca}-categoria`);
    expect(criada?.atributos_molde).toHaveLength(1);

    await cat.updateCategoria(id, { ...criada!, nome: `${marca}-categoria-editada` });
    expect((await cat.getCategoria(id))?.nome).toBe(`${marca}-categoria-editada`);

    await cat.deleteCategoria(id);
    expect(await cat.getCategoria(id)).toBeNull();
  });
});
