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

  it('categoria em uso não pode ser apagada, mas libera depois que o produto é removido', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-em-uso`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-em-uso`, descricao: null,
      atributos: {}, preco: 100, ativo: true,
    });

    await expect(cat.deleteCategoria(categoriaId)).rejects.toThrow('Categoria em uso por 1 produto.');

    await prod.softDeleteProduto(produtoId);
    await sql`delete from produtos where id = ${produtoId}`;
    await cat.deleteCategoria(categoriaId);
    expect(await cat.getCategoria(categoriaId)).toBeNull();
  });

  it('combo: cria com itens, edita e soft-delete', async () => {
    const prod = await import('@/lib/db/produtos');
    const cmb = await import('@/lib/db/combos');
    const cat = await import('@/lib/db/categorias-produto');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-combo`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-combo`, descricao: null,
      atributos: {}, preco: 199, ativo: true,
    });

    const comboId = await cmb.createCombo({
      nome: `${marca}-combo`, descricao: null, preco: 700, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 4 }],
    });

    const criado = await cmb.getCombo(comboId);
    expect(criado?.itens).toHaveLength(1);
    expect(criado?.itens[0].quantidade).toBe(4);
    expect(criado?.preco).toBe(700);

    await cmb.updateCombo(comboId, {
      nome: `${marca}-combo-editado`, descricao: null, preco: 750, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 5 }],
    });
    const editado = await cmb.getCombo(comboId);
    expect(editado?.itens[0].quantidade).toBe(5);

    await cmb.softDeleteCombo(comboId);
    expect(await cmb.getCombo(comboId)).toBeNull();

    await sql`delete from combos where id = ${comboId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('plano: pacote_fechado e assinatura, e o check do banco rejeita mistura', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const pl = await import('@/lib/db/planos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-plano`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-plano`, descricao: null,
      atributos: {}, preco: 399, ativo: true,
    });

    const fechadoId = await pl.createPlano({
      nome: `${marca}-plano-fechado`, descricao: null, tipo_cobranca: 'pacote_fechado',
      validade_dias: 90, ciclo: null, preco: 2500, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 2 }],
    });
    const fechado = await pl.getPlano(fechadoId);
    expect(fechado?.validade_dias).toBe(90);
    expect(fechado?.ciclo).toBeNull();

    const assinaturaId = await pl.createPlano({
      nome: `${marca}-plano-assinatura`, descricao: null, tipo_cobranca: 'assinatura',
      validade_dias: null, ciclo: 'mensal', preco: 1500, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 48 }],
    });
    const assinatura = await pl.getPlano(assinaturaId);
    expect(assinatura?.ciclo).toBe('mensal');
    expect(assinatura?.validade_dias).toBeNull();

    await expect(sql`
      insert into planos (nome, tipo_cobranca, validade_dias, ciclo, preco)
      values (${`${marca}-invalido`}, 'pacote_fechado', 10, 'mensal', 100)
    `).rejects.toMatchObject({ code: '23514' });

    await pl.softDeletePlano(fechadoId);
    await pl.softDeletePlano(assinaturaId);
    await sql`delete from planos where id in (${fechadoId}, ${assinaturaId})`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('produto apagado aparece na lixeira, restaura e depois expurga', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-lixeira`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-lixeira`, descricao: null,
      atributos: {}, preco: 100, ativo: true,
    });
    await prod.softDeleteProduto(produtoId);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'produto' && i.id === produtoId);
    expect(item?.title).toBe(`${marca}-produto-lixeira`);

    await q.restoreItem('produto', produtoId);
    expect(await prod.getProduto(produtoId)).not.toBeNull();

    await prod.softDeleteProduto(produtoId);
    await q.purgeItem('produto', produtoId);
    const linhas = (await sql`select id from produtos where id = ${produtoId}`) as { id: string }[];
    expect(linhas).toHaveLength(0);

    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('combo apagado aparece na lixeira, restaura e depois expurga', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const cmb = await import('@/lib/db/combos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-combo-lixeira`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-combo-lixeira`, descricao: null,
      atributos: {}, preco: 100, ativo: true,
    });
    const comboId = await cmb.createCombo({
      nome: `${marca}-combo-lixeira`, descricao: null, preco: 100, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 1 }],
    });

    await cmb.softDeleteCombo(comboId);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'combo' && i.id === comboId);
    expect(item?.title).toBe(`${marca}-combo-lixeira`);

    await q.restoreItem('combo', comboId);
    expect(await cmb.getCombo(comboId)).not.toBeNull();

    await cmb.softDeleteCombo(comboId);
    await q.purgeItem('combo', comboId);
    const linhas = (await sql`select id from combos where id = ${comboId}`) as { id: string }[];
    expect(linhas).toHaveLength(0);

    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('plano apagado aparece na lixeira, restaura e depois expurga', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const pl = await import('@/lib/db/planos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-plano-lixeira`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-plano-lixeira`, descricao: null,
      atributos: {}, preco: 100, ativo: true,
    });
    const planoId = await pl.createPlano({
      nome: `${marca}-plano-lixeira`, descricao: null, tipo_cobranca: 'pacote_fechado',
      validade_dias: 30, ciclo: null, preco: 100, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 1 }],
    });

    await pl.softDeletePlano(planoId);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'plano' && i.id === planoId);
    expect(item?.title).toBe(`${marca}-plano-lixeira`);

    await q.restoreItem('plano', planoId);
    expect(await pl.getPlano(planoId)).not.toBeNull();

    await pl.softDeletePlano(planoId);
    await q.purgeItem('plano', planoId);
    const linhas = (await sql`select id from planos where id = ${planoId}`) as { id: string }[];
    expect(linhas).toHaveLength(0);

    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('expurgar produto ainda referenciado por um combo rejeita com ItemEmUsoError, em vez de crashar', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const cmb = await import('@/lib/db/combos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-produto-em-uso`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-referenciado`, descricao: null,
      atributos: {}, preco: 50, ativo: true,
    });
    const comboId = await cmb.createCombo({
      nome: `${marca}-combo-referenciador`, descricao: null, preco: 50, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoId, quantidade: 1 }],
    });

    await prod.softDeleteProduto(produtoId);
    await expect(q.purgeItem('produto', produtoId)).rejects.toThrow(q.ItemEmUsoError);

    await cmb.softDeleteCombo(comboId);
    await q.purgeItem('combo', comboId);
    await q.purgeItem('produto', produtoId);

    const linhas = (await sql`select id from produtos where id = ${produtoId}`) as { id: string }[];
    expect(linhas).toHaveLength(0);

    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('plano_itens: o check do banco rejeita tipo_item "produto" com combo_id preenchido', async () => {
    const cat = await import('@/lib/db/categorias-produto');
    const pl = await import('@/lib/db/planos');

    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-plano-itens-check`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const planoId = await pl.createPlano({
      nome: `${marca}-plano-itens-check`, descricao: null, tipo_cobranca: 'pacote_fechado',
      validade_dias: 30, ciclo: null, preco: 100, ativo: true, itens: [],
    });

    await expect(sql`
      insert into plano_itens (plano_id, tipo_item, combo_id, quantidade)
      values (${planoId}, 'produto', ${randomUUID()}, 1)
    `).rejects.toMatchObject({ code: '23514' });

    await pl.softDeletePlano(planoId);
    await sql`delete from planos where id = ${planoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
  });

  it('cria local com estudios, edita renomeando um e adicionando outro sem perder o id do renomeado', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local`, endereco: 'Rua X, 100', responsavel: 'Fulano',
      estudios: [{ nome: 'Estúdio A' }, { nome: 'Estúdio B' }],
    });

    const criado = await lg.getLocal(id);
    expect(criado?.estudios).toHaveLength(2);
    const estudioA = criado!.estudios.find((e) => e.nome === 'Estúdio A')!;

    await lg.updateLocal(id, {
      nome: `${marca}-local-editado`, endereco: null, responsavel: null,
      estudios: [{ id: estudioA.id, nome: 'Estúdio A renomeado' }, { nome: 'Estúdio C' }],
    });

    const editado = await lg.getLocal(id);
    expect(editado?.nome).toBe(`${marca}-local-editado`);
    expect(editado?.estudios.map((e) => e.nome).sort()).toEqual(['Estúdio A renomeado', 'Estúdio C']);
    // O id do estúdio renomeado não mudou — é o que garante que uma referência futura
    // (Agenda) sobreviveria a essa edição.
    expect(editado?.estudios.find((e) => e.nome === 'Estúdio A renomeado')?.id).toBe(estudioA.id);
    // "Estúdio B" saiu da lista enviada: some da listagem ativa (soft-deleted).
    expect(editado?.estudios.some((e) => e.nome === 'Estúdio B')).toBe(false);

    await sql`delete from estudios where local_id = ${id}`;
    await sql`delete from locais_gravacao where id = ${id}`;
  });

  it('estudio removido da lista no update aparece na lixeira; apagar o local nao arrasta os estudios', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local-lixeira`, endereco: null, responsavel: null,
      estudios: [{ nome: 'Estúdio A' }],
    });
    const [estudioA] = (await lg.getLocal(id))!.estudios;

    await lg.updateLocal(id, {
      nome: `${marca}-local-lixeira`, endereco: null, responsavel: null, estudios: [],
    });

    // Checagem direto na tabela, não via `q.listTrash()`: `listTrash` só passa a
    // reconhecer `kind: 'estudio'` na Task 5 — esta task ainda não a modifica.
    const linhaEstudioRemovido = (await sql`
      select deleted_at from estudios where id = ${estudioA.id}`) as { deleted_at: string | null }[];
    expect(linhaEstudioRemovido[0]?.deleted_at).not.toBeNull();

    await lg.softDeleteLocal(id);
    const linhaEstudio = (await sql`
      select deleted_at from estudios where id = ${estudioA.id}`) as { deleted_at: string }[];
    // O estúdio já estava soft-deleted desde o update acima; apagar o local não altera
    // esse timestamp (cada um soft-deleta na própria hora, sem cascata).
    expect(linhaEstudio[0]?.deleted_at).not.toBeNull();

    await sql`delete from estudios where local_id = ${id}`;
    await sql`delete from locais_gravacao where id = ${id}`;
  });

  it('editar um local nao renomeia estudio pertencente a outro local', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const idA = await lg.createLocal({
      nome: `${marca}-local-A`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio A' }],
    });
    const idB = await lg.createLocal({
      nome: `${marca}-local-B`, endereco: null, responsavel: null, estudios: [],
    });
    const [estudioDoLocalA] = (await lg.getLocal(idA))!.estudios;

    // Tenta renomear, a partir do local B, um estúdio que pertence ao local A.
    await lg.updateLocal(idB, {
      nome: `${marca}-local-B`, endereco: null, responsavel: null,
      estudios: [{ id: estudioDoLocalA.id, nome: 'Nome hostil' }],
    });

    const linha = (await sql`select nome, local_id from estudios where id = ${estudioDoLocalA.id}`) as
      { nome: string; local_id: string }[];
    expect(linha[0]?.nome).toBe('Estúdio A');
    expect(linha[0]?.local_id).toBe(idA);

    await sql`delete from estudios where local_id in (${idA}, ${idB})`;
    await sql`delete from locais_gravacao where id in (${idA}, ${idB})`;
  });

  it('local apagado aparece na lixeira, restaura e depois expurga', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local-crud-lixeira`, endereco: null, responsavel: null, estudios: [],
    });
    await lg.softDeleteLocal(id);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'local_gravacao' && i.id === id);
    expect(item?.title).toBe(`${marca}-local-crud-lixeira`);

    await q.restoreItem('local_gravacao', id);
    expect(await lg.getLocal(id)).not.toBeNull();

    await lg.softDeleteLocal(id);
    await q.purgeItem('local_gravacao', id);
    const linhas = (await sql`select id from locais_gravacao where id = ${id}`) as { id: string }[];
    expect(linhas).toHaveLength(0);
  });

  it('expurgar local ainda com estudio (mesmo na lixeira) rejeita com ItemEmUsoError, em vez de crashar', async () => {
    const lg = await import('@/lib/db/locais-gravacao');

    const id = await lg.createLocal({
      nome: `${marca}-local-com-estudio-em-uso`, endereco: null, responsavel: null,
      estudios: [{ nome: 'Estúdio A' }],
    });
    const [estudioA] = (await lg.getLocal(id))!.estudios;

    await lg.softDeleteLocal(id);
    await expect(q.purgeItem('local_gravacao', id)).rejects.toThrow(q.ItemEmUsoError);

    await sql`delete from estudios where id = ${estudioA.id}`;
    await sql`delete from locais_gravacao where id = ${id}`;
  });

  it('cria agendamento, lista na semana certa, e bloqueia conflito no mesmo estudio', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const lg = await import('@/lib/db/locais-gravacao');
    const ag = await import('@/lib/db/agenda');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-agenda`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-agenda`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-agenda`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio A' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const dadosBase = {
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado' as const, data: '2026-08-24', hora_inicio: '09:00', hora_fim: '10:00',
    };

    const id1 = await ag.createAgendamento(dadosBase);
    const semana = await ag.listAgendamentosDaSemana(estudio.id, '2026-08-24');
    expect(semana.map((a) => a.id)).toContain(id1);
    expect(semana.find((a) => a.id === id1)?.cliente_nome).toBe(`${marca}-cliente-agenda`);

    // Sobrepõe o mesmo horário no mesmo estúdio → bloqueia.
    await expect(ag.createAgendamento({
      ...dadosBase, hora_inicio: '09:30', hora_fim: '10:30',
    })).rejects.toThrow(ag.ConflitoHorarioError);

    // Mesmo horário, estúdio diferente (criado só pra este teste) → sem problema.
    const localId2 = await lg.createLocal({
      nome: `${marca}-local-agenda-2`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio B' }],
    });
    const [estudio2] = (await lg.getLocal(localId2))!.estudios;
    const id2 = await ag.createAgendamento({ ...dadosBase, local_id: localId2, estudio_id: estudio2.id });
    expect(id2).toBeTruthy();

    await sql`delete from agendamentos where id in (${id1}, ${id2})`;
    await sql`delete from estudios where local_id in (${localId}, ${localId2})`;
    await sql`delete from locais_gravacao where id in (${localId}, ${localId2})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('cancelado nao bloqueia conflito; mover para horario livre funciona; soft-delete some da lista', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const lg = await import('@/lib/db/locais-gravacao');
    const ag = await import('@/lib/db/agenda');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-agenda-2`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-agenda-2`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-agenda-3`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio C' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const dadosBase = {
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'cancelado' as const, data: '2026-08-25', hora_inicio: '09:00', hora_fim: '10:00',
    };

    const id1 = await ag.createAgendamento(dadosBase);
    // id1 esta cancelado — nao bloqueia o mesmo horario.
    const id2 = await ag.createAgendamento({ ...dadosBase, status: 'agendado' });

    // Mover id2 pro proprio horario de id1 (cancelado) nao deveria bloquear.
    await ag.moverOuRedimensionar(id2, '2026-08-25', '09:00', '10:00');
    const semana = await ag.listAgendamentosDaSemana(estudio.id, '2026-08-25');
    expect(semana.find((a) => a.id === id2)?.hora_inicio.slice(0, 5)).toBe('09:00');

    await ag.softDeleteAgendamento(id2);
    const semanaDepois = await ag.listAgendamentosDaSemana(estudio.id, '2026-08-25');
    expect(semanaDepois.map((a) => a.id)).not.toContain(id2);

    await sql`delete from agendamentos where id in (${id1}, ${id2})`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('mover para horário ocupado rejeita e preserva o agendamento original', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const lg = await import('@/lib/db/locais-gravacao');
    const ag = await import('@/lib/db/agenda');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-agenda-conflito-mover`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-agenda-conflito-mover`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-agenda-conflito-mover`, endereco: null, responsavel: null,
      estudios: [{ nome: 'Estúdio conflito mover' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;
    const base = {
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado' as const, data: '2026-08-27', hora_inicio: '09:00', hora_fim: '10:00',
    };
    const ocupadoId = await ag.createAgendamento(base);
    const movidoId = await ag.createAgendamento({ ...base, hora_inicio: '11:00', hora_fim: '12:00' });

    await expect(ag.moverOuRedimensionar(movidoId, '2026-08-27', '09:30', '10:30'))
      .rejects.toThrow(ag.ConflitoHorarioError);
    const semana = await ag.listAgendamentosDaSemana(estudio.id, '2026-08-24');
    const preservado = semana.find((a) => a.id === movidoId);
    expect(preservado?.data).toBe('2026-08-27');
    expect(preservado?.hora_inicio.slice(0, 5)).toBe('11:00');
    expect(preservado?.hora_fim.slice(0, 5)).toBe('12:00');

    await sql`delete from agendamentos where id in (${ocupadoId}, ${movidoId})`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('updateAgendamento persiste a edição completa de status e categoria', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const lg = await import('@/lib/db/locais-gravacao');
    const ag = await import('@/lib/db/agenda');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-agenda-update`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-agenda-update-original`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const categoriaNovaId = await cat.createCategoria({
      nome: `${marca}-categoria-agenda-update-nova`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-agenda-update`, endereco: null, responsavel: null,
      estudios: [{ nome: 'Estúdio update' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;
    const base = {
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'pre_agendado' as const, data: '2026-08-28', hora_inicio: '14:00', hora_fim: '15:00',
    };
    const id = await ag.createAgendamento(base);

    await ag.updateAgendamento(id, {
      ...base, categoria_produto_id: categoriaNovaId, status: 'concluido',
    });
    const semana = await ag.listAgendamentosDaSemana(estudio.id, '2026-08-24');
    const atualizado = semana.find((a) => a.id === id);
    expect(atualizado?.status).toBe('concluido');
    expect(atualizado?.categoria_produto_id).toBe(categoriaNovaId);
    expect(atualizado?.categoria_nome).toBe(`${marca}-categoria-agenda-update-nova`);

    await sql`delete from agendamentos where id = ${id}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from categorias_produto where id in (${categoriaId}, ${categoriaNovaId})`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('agendamento apagado aparece na lixeira, restaura e depois expurga', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const lg = await import('@/lib/db/locais-gravacao');
    const ag = await import('@/lib/db/agenda');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-agenda-lixeira`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-agenda-lixeira`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-agenda-lixeira`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio D' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const id = await ag.createAgendamento({
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado', data: '2026-08-26', hora_inicio: '09:00', hora_fim: '10:00',
    });
    await ag.softDeleteAgendamento(id);

    const lixeira = await q.listTrash();
    const item = lixeira.find((i) => i.kind === 'agendamento' && i.id === id);
    expect(item?.title).toBe(`${marca}-cliente-agenda-lixeira — 26/08/2026`);

    await q.restoreItem('agendamento', id);
    const semana = await ag.listAgendamentosDaSemana(estudio.id, '2026-08-26');
    expect(semana.map((a) => a.id)).toContain(id);

    await ag.softDeleteAgendamento(id);
    await q.purgeItem('agendamento', id);
    const linhas = (await sql`select id from agendamentos where id = ${id}`) as { id: string }[];
    expect(linhas).toHaveLength(0);

    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('bloqueio impede agendamento sobreposto e agendamento existente impede bloqueio sobreposto', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const lg = await import('@/lib/db/locais-gravacao');
    const ag = await import('@/lib/db/agenda');
    const bl = await import('@/lib/db/bloqueios');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-bloqueio`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-bloqueio`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-bloqueio`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio E' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    // Bloqueia 14:00-15:00 e confirma que aparece na semana e nos ativos.
    const bloqueioId = await bl.createBloqueio({
      estudio_id: estudio.id, data: '2026-08-29', hora_inicio: '14:00', hora_fim: '15:00', motivo: 'Manutenção',
    });
    const semanaBloqueios = await bl.listBloqueiosDaSemana(estudio.id, '2026-08-24');
    expect(semanaBloqueios.map((b) => b.id)).toContain(bloqueioId);
    const ativos = await bl.listBloqueiosAtivos(estudio.id);
    expect(ativos.map((b) => b.id)).toContain(bloqueioId);

    // Tentar agendar em cima do bloqueio (mesmo estúdio, horário sobreposto) rejeita.
    await expect(ag.createAgendamento({
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado', data: '2026-08-29', hora_inicio: '14:30', hora_fim: '15:30',
    })).rejects.toThrow(ag.ConflitoHorarioError);

    // Agendar num horário livre do mesmo dia funciona normalmente.
    const agendamentoId = await ag.createAgendamento({
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado', data: '2026-08-29', hora_inicio: '09:00', hora_fim: '10:00',
    });

    // Tentar bloquear em cima de um agendamento existente rejeita.
    await expect(bl.createBloqueio({
      estudio_id: estudio.id, data: '2026-08-29', hora_inicio: '09:30', hora_fim: '10:30', motivo: null,
    })).rejects.toThrow(bl.ConflitoBloqueioError);

    // Mover o agendamento pra cima do bloqueio também rejeita.
    await expect(ag.moverOuRedimensionar(agendamentoId, '2026-08-29', '14:00', '15:00'))
      .rejects.toThrow(ag.ConflitoHorarioError);

    // Remover o bloqueio (soft-delete) libera o horário de novo.
    await bl.softDeleteBloqueio(bloqueioId);
    const semanaDepois = await bl.listBloqueiosDaSemana(estudio.id, '2026-08-24');
    expect(semanaDepois.map((b) => b.id)).not.toContain(bloqueioId);
    const idLivre = await ag.createAgendamento({
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado', data: '2026-08-29', hora_inicio: '14:00', hora_fim: '15:00',
    });
    expect(idLivre).toBeTruthy();

    await sql`delete from agendamentos where id in (${agendamentoId}, ${idLivre})`;
    await sql`delete from bloqueios_estudio where id = ${bloqueioId}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('avulso e combo: expande itens corretamente e calcula preço total', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const combos = await import('@/lib/db/combos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-1`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-1`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoAId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoA`, descricao: null, atributos: {}, preco: 100, ativo: true,
    });
    const produtoBId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoB`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });
    const comboId = await combos.createCombo({
      nome: `${marca}-combo`, descricao: null, preco: 300, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoAId, quantidade: 2 }, { tipo: 'produto', valor: produtoBId, quantidade: 1 }],
    });

    // Avulso: 3x produtoA, preço = 100 * 3.
    const avulsoId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoAId, combo_id: null, plano_id: null, quantidade: 3,
    });
    const lista1 = await ct.listContratacoes();
    const avulso = lista1.find((c) => c.id === avulsoId)!;
    expect(avulso.preco_total).toBe(300);
    expect(avulso.data_validade).toBeNull();
    expect(avulso.itens).toEqual([
      { produto_id: produtoAId, produto_nome: `${marca}-produtoA`, quantidade_total: 3, quantidade_consumida: 0 },
    ]);

    // Combo comprado 2x: itens do combo (2x produtoA, 1x produtoB) multiplicados por 2.
    const comboContratId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'combo', produto_id: null, combo_id: comboId, plano_id: null, quantidade: 2,
    });
    const lista2 = await ct.listContratacoes();
    const comboContrat = lista2.find((c) => c.id === comboContratId)!;
    expect(comboContrat.preco_total).toBe(600);
    const itensOrdenados = [...comboContrat.itens].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome));
    expect(itensOrdenados).toEqual([
      { produto_id: produtoAId, produto_nome: `${marca}-produtoA`, quantidade_total: 4, quantidade_consumida: 0 },
      { produto_id: produtoBId, produto_nome: `${marca}-produtoB`, quantidade_total: 2, quantidade_consumida: 0 },
    ]);

    await sql`delete from contratacoes where id in (${avulsoId}, ${comboContratId})`;
    await sql`delete from combo_itens where combo_id = ${comboId}`;
    await sql`delete from combos where id = ${comboId}`;
    await sql`delete from produtos where id in (${produtoAId}, ${produtoBId})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('plano pacote_fechado expande produto direto e combo aninhado, soma repetidos e calcula validade; assinatura não expira', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const combos = await import('@/lib/db/combos');
    const planos = await import('@/lib/db/planos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-2`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-2`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoAId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoA2`, descricao: null, atributos: {}, preco: 100, ativo: true,
    });
    const produtoBId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoB2`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });
    // Combo com 2x produtoA — usado dentro do plano, pra testar expansão de 2 níveis.
    const comboId = await combos.createCombo({
      nome: `${marca}-combo2`, descricao: null, preco: 250, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoAId, quantidade: 2 }],
    });
    // Plano pacote_fechado: 1x produtoA direto + 1x comboId (que expande em 2x produtoA) → total produtoA = 3.
    const planoFechadoId = await planos.createPlano({
      nome: `${marca}-plano-fechado`, descricao: null, tipo_cobranca: 'pacote_fechado',
      validade_dias: 30, ciclo: null, preco: 500, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoAId, quantidade: 1 }, { tipo: 'combo', valor: comboId, quantidade: 1 }],
    });
    const planoAssinaturaId = await planos.createPlano({
      nome: `${marca}-plano-assinatura`, descricao: null, tipo_cobranca: 'assinatura',
      validade_dias: null, ciclo: 'mensal', preco: 200, ativo: true,
      itens: [{ tipo: 'produto', valor: produtoBId, quantidade: 3 }],
    });

    const fechadoId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'plano', produto_id: null, combo_id: null, plano_id: planoFechadoId, quantidade: 1,
    });
    const listaFechado = await ct.listContratacoes();
    const fechado = listaFechado.find((c) => c.id === fechadoId)!;
    expect(fechado.itens).toEqual([
      { produto_id: produtoAId, produto_nome: `${marca}-produtoA2`, quantidade_total: 3, quantidade_consumida: 0 },
    ]);
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 30);
    expect(fechado.data_validade).toBe(esperado.toISOString().slice(0, 10));

    const assinaturaId = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'plano', produto_id: null, combo_id: null, plano_id: planoAssinaturaId, quantidade: 1,
    });
    const listaAssinatura = await ct.listContratacoes();
    const assinatura = listaAssinatura.find((c) => c.id === assinaturaId)!;
    expect(assinatura.data_validade).toBeNull();
    expect(assinatura.itens).toEqual([
      { produto_id: produtoBId, produto_nome: `${marca}-produtoB2`, quantidade_total: 3, quantidade_consumida: 0 },
    ]);

    await sql`delete from contratacoes where id in (${fechadoId}, ${assinaturaId})`;
    await sql`delete from plano_itens where plano_id in (${planoFechadoId}, ${planoAssinaturaId})`;
    await sql`delete from planos where id in (${planoFechadoId}, ${planoAssinaturaId})`;
    await sql`delete from combo_itens where combo_id = ${comboId}`;
    await sql`delete from combos where id = ${comboId}`;
    await sql`delete from produtos where id in (${produtoAId}, ${produtoBId})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('contratação de item inativo é rejeitada', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-3`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-3`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-inativo`, descricao: null, atributos: {}, preco: 10, ativo: false,
    });

    await expect(ct.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 1,
    })).rejects.toThrow(ct.ItemInativoError);

    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('cancelamento faz soft-delete sem alterar quantidade_consumida', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const ct = await import('@/lib/db/contratacoes');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-contratacao-4`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-contratacao-4`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-cancelamento`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });

    const id = await ct.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 5,
    });
    // Simula consumo parcial que a futura OS faria.
    await sql`update contratacao_itens set quantidade_consumida = 2 where contratacao_id = ${id}`;

    await ct.softDeleteContratacao(id);
    // Cancelada some da lista (mesmo padrão de soft-delete do resto do sistema).
    const lista = await ct.listContratacoes();
    expect(lista.map((c) => c.id)).not.toContain(id);

    // Mas continua visível no histórico do cliente, marcada como cancelada — é essa a
    // visão que substitui o acesso perdido pela lista principal (ver módulo de
    // relatórios/gestão financeira, ainda não construído).
    const historico = await ct.listContratacoesDoCliente(clienteId);
    const doCliente = historico.find((c) => c.id === id);
    expect(doCliente).toBeDefined();
    expect(doCliente?.cancelada).toBe(true);

    // Mas o saldo consumido continua intacto no banco, preservando o histórico.
    const itemRow = (await sql`
      select quantidade_total, quantidade_consumida from contratacao_itens where contratacao_id = ${id}`) as
      { quantidade_total: number; quantidade_consumida: number }[];
    expect(itemRow[0].quantidade_consumida).toBe(2);
    expect(itemRow[0].quantidade_total).toBe(5);

    await expect(ct.softDeleteContratacao(id)).rejects.toThrow();

    await sql`delete from contratacoes where id = ${id}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('FIFO desconta da contratação mais antiga primeiro, criando os_item_saldos correspondentes', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-1`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-1`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-1`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });

    const contratacao1Id = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 2,
    });
    const contratacao2Id = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 5,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 4, pre_agendar: false,
        data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
      }],
    });
    expect(osId).toBeTruthy();

    const itemContratacao1 = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacao1Id}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    const itemContratacao2 = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacao2Id}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    // Contratação 1 (mais antiga) tinha saldo 2 — esgota primeiro. Contratação 2 cobre o resto (2).
    // OS agora RESERVA na criação (Task 4) — consumo só na conclusão do card.
    expect(itemContratacao1[0].quantidade_reservada).toBe(2);
    expect(itemContratacao1[0].quantidade_consumida).toBe(0);
    expect(itemContratacao2[0].quantidade_reservada).toBe(2);
    expect(itemContratacao2[0].quantidade_consumida).toBe(0);

    // Uma tarefa por unidade reservada (card = 1 unidade): 4 unidades pedidas => 4 tarefas,
    // nascendo em 'a_fazer' e não consumidas.
    const tarefasGeradas = (await sql`
      select coluna, consumido, contratacao_item_id from tarefas where cliente_id = ${clienteId}`) as
      { coluna: string; consumido: boolean; contratacao_item_id: string }[];
    expect(tarefasGeradas).toHaveLength(4);
    expect(tarefasGeradas.every((t) => t.coluna === 'a_fazer' && t.consumido === false)).toBe(true);

    // Distribuição real das tarefas por contratação: 2 vieram da contratação 1 (mais
    // antiga, saldo 2, esgotou primeiro), 2 vieram da contratação 2 (cobriu o resto).
    // Sem isso, uma tarefa apontando para a contratação errada (FK ainda válida, nenhuma
    // constraint reclama) passaria despercebida — só a contagem total era checada.
    const [itemContratacao1Row] = (await sql`
      select id from contratacao_itens where contratacao_id = ${contratacao1Id}`) as { id: string }[];
    const [itemContratacao2Row] = (await sql`
      select id from contratacao_itens where contratacao_id = ${contratacao2Id}`) as { id: string }[];
    expect(tarefasGeradas.filter((t) => t.contratacao_item_id === itemContratacao1Row.id)).toHaveLength(2);
    expect(tarefasGeradas.filter((t) => t.contratacao_item_id === itemContratacao2Row.id)).toHaveLength(2);

    await sql`delete from tarefas where cliente_id = ${clienteId}`;
    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from contratacao_itens where contratacao_id in (${contratacao1Id}, ${contratacao2Id})`;
    await sql`delete from contratacoes where id in (${contratacao1Id}, ${contratacao2Id})`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('duas linhas da mesma OS com o mesmo produto não sobre-alocam o mesmo saldo (achado Critical 2)', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-5`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-5`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-5`, descricao: null, atributos: {}, preco: 50, ativo: true,
    });

    // Contratação A com saldo 2, contratação B com saldo 5 — total 7, mais antiga primeiro.
    const contratacaoAId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 2,
    });
    const contratacaoBId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 5,
    });

    // OS com 2 linhas do MESMO produto, quantidade 2 cada — total 4, dentro do saldo de 7.
    // Antes do fix, a linha 2 relia o saldo do zero e via a contratação A "ainda com 2
    // disponíveis", sobre-alocando e violando a constraint `quantidade_consumida <= quantidade_total`.
    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [
        { produto_id: produtoId, quantidade: 2, pre_agendar: false, data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null },
        { produto_id: produtoId, quantidade: 2, pre_agendar: false, data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null },
      ],
    });
    expect(osId).toBeTruthy();

    const itemA = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoAId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    const itemB = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoBId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    // A (mais antiga, saldo 2) esgota primeiro; B cobre o resto (2). Soma = 4, sem estourar A.
    // Task 4: OS reserva, não consome.
    expect(itemA[0].quantidade_reservada).toBe(2);
    expect(itemB[0].quantidade_reservada).toBe(2);
    expect(itemA[0].quantidade_reservada + itemB[0].quantidade_reservada).toBe(4);
    expect(itemA[0].quantidade_consumida).toBe(0);
    expect(itemB[0].quantidade_consumida).toBe(0);

    // Fecha a lacuna de "FIFO nunca afirma os_item_saldos diretamente": confere as linhas de
    // desconto geradas, uma por (os_item, contratacao_item).
    const saldos = (await sql`
      select os_item_saldos.contratacao_item_id as contratacao_item_id, os_item_saldos.quantidade as quantidade
        from os_item_saldos
        join os_itens on os_itens.id = os_item_saldos.os_item_id
       where os_itens.os_id = ${osId}
       order by os_item_saldos.quantidade`) as { contratacao_item_id: string; quantidade: number }[];
    const [itemContratacaoAId] = (await sql`
      select id from contratacao_itens where contratacao_id = ${contratacaoAId}`) as { id: string }[];
    const [itemContratacaoBId] = (await sql`
      select id from contratacao_itens where contratacao_id = ${contratacaoBId}`) as { id: string }[];
    expect(saldos).toHaveLength(2);
    const totalDescontado = saldos.reduce((acc, s) => acc + s.quantidade, 0);
    expect(totalDescontado).toBe(4);
    expect(saldos.some((s) => s.contratacao_item_id === itemContratacaoAId.id && s.quantidade === 2)).toBe(true);
    expect(saldos.some((s) => s.contratacao_item_id === itemContratacaoBId.id && s.quantidade === 2)).toBe(true);

    await sql`delete from tarefas where cliente_id = ${clienteId}`;
    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from contratacao_itens where contratacao_id in (${contratacaoAId}, ${contratacaoBId})`;
    await sql`delete from contratacoes where id in (${contratacaoAId}, ${contratacaoBId})`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('saldo insuficiente rejeita a OS inteira, sem gravar nada', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-2`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-2`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoAId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoA-os-2`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const produtoBId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produtoB-os-2`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoAId, combo_id: null, plano_id: null, quantidade: 5,
    });
    // produtoB nunca foi contratado — saldo 0.

    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [
        { produto_id: produtoAId, quantidade: 2, pre_agendar: false, data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null },
        { produto_id: produtoBId, quantidade: 1, pre_agendar: false, data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null },
      ],
    })).rejects.toThrow(os.SaldoInsuficienteError);

    const osRows = (await sql`select id from ordens_servico where cliente_id = ${clienteId}`) as { id: string }[];
    expect(osRows).toHaveLength(0);
    const itemA = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    expect(itemA[0].quantidade_reservada).toBe(0);
    expect(itemA[0].quantidade_consumida).toBe(0);
    const tarefasGeradas = (await sql`select id from tarefas where cliente_id = ${clienteId}`) as { id: string }[];
    expect(tarefasGeradas).toHaveLength(0);

    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from produtos where id in (${produtoAId}, ${produtoBId})`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('N criações concorrentes disputando a última unidade: quem perde não deixa OS, os_itens nem tarefa órfã', async () => {
    // Regressão do achado Critical corrigido nesta rodada: a tentativa anterior de tratar
    // saldo insuficiente com guard-in-where (`and quantidade_total - quantidade_reservada -
    // quantidade_consumida >= ${d.quantidade}`, `returning id`) no UPDATE de
    // `quantidade_reservada`, dentro do array passado a `sql.transaction`, não fazia a
    // chamada perdedora abortar de verdade: um UPDATE que só casa zero linhas não é erro
    // SQL, então não aborta o resto do batch (driver neon-http trata o array como statements
    // independentes, não como uma transação onde um erro aborta tudo). O `insert into
    // ordens_servico`, `os_itens`, `os_item_saldos`, `agendamentos` e principalmente `tarefas`
    // do mesmo batch da chamada perdedora committavam normalmente — só depois da promise já
    // ter resolvido é que o código lançava `SaldoInsuficienteError`, com o dado órfão já
    // gravado para sempre. A correção restaura a atomicidade real: o UPDATE de reserva não
    // tem guard, e é a constraint `contratacao_itens_saldo_check` (migração 012) que aborta
    // a transação inteira quando a soma estoura — o catch em torno de `sql.transaction`
    // traduz esse erro (code 23514, constraint do nome certo) em `SaldoInsuficienteError`.
    //
    // Este teste detecta o bug de fato (não é só teórico): rodado contra o código buggy
    // restaurado deliberadamente (guard-in-where + `returning id` + checagem pós-transação),
    // pegou a corrida e encontrou uma segunda linha em `ordens_servico` — dado fantasma de
    // uma chamada que o chamador via como rejeitada. Como o driver neon-http é HTTP puro
    // (sem transação compartilhada entre chamadas concorrentes, mesma limitação documentada
    // no teste de corrida equivalente em `lib/db/tarefas.ts`), a corrida real nem sempre
    // acontece em toda execução — é probabilística, não garantida a cada rodada. N=10 já foi
    // suficiente para reproduzi-la de forma confiável nesta investigação.
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-corrida`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-corrida`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-corrida`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    // Só 1 unidade de saldo — N chamadas concorrentes disputam a mesma última unidade.
    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 1,
    });

    const dados = {
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: false,
        data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
      }],
    };

    const N = 10;
    const resultados = await Promise.allSettled(
      Array.from({ length: N }, () => os.createOrdemServico(dados)),
    );

    const cumpridas = resultados.filter(
      (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
    );
    const rejeitadas = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(cumpridas).toHaveLength(1);
    expect(rejeitadas).toHaveLength(N - 1);
    for (const r of rejeitadas) expect(r.reason).toBeInstanceOf(os.SaldoInsuficienteError);

    // Caminho feliz: a única OS vencedora existe, com seu item e sua tarefa.
    const osVencedoraId = cumpridas[0].value;
    const osRows = (await sql`select id from ordens_servico where cliente_id = ${clienteId}`) as { id: string }[];
    expect(osRows).toHaveLength(1);
    expect(osRows[0].id).toBe(osVencedoraId);
    const osItensRows = (await sql`select id from os_itens where os_id = ${osVencedoraId}`) as { id: string }[];
    expect(osItensRows).toHaveLength(1);
    const tarefasRows = (await sql`select id from tarefas where cliente_id = ${clienteId}`) as { id: string }[];
    expect(tarefasRows).toHaveLength(1);

    // Saldo nunca passa de 1 reservado, mesmo com N-1 tentativas concorrentes perdendo a corrida.
    const saldo = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    expect(saldo[0].quantidade_reservada).toBe(1);
    expect(saldo[0].quantidade_consumida).toBe(0);

    await sql`delete from tarefas where cliente_id = ${clienteId}`;
    await sql`delete from ordens_servico where cliente_id = ${clienteId}`;
    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('item pré-agendado cria agendamento pre_agendado; conflito de horário e bloqueio de estúdio rejeitam a OS inteira', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const lg = await import('@/lib/db/locais-gravacao');
    const contr = await import('@/lib/db/contratacoes');
    const ag = await import('@/lib/db/agenda');
    const bloqueios = await import('@/lib/db/bloqueios');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-3`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-3`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-3`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-os-3`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio OS 3' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 3,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: true,
        data: '2026-09-10', hora_inicio: '09:00', hora_fim: '10:00', local_id: localId, estudio_id: estudio.id,
      }],
    });
    const [{ agendamento_id: agendamentoId }] = (await sql`
      select agendamento_id from os_itens where os_id = ${osId}`) as { agendamento_id: string }[];
    expect(agendamentoId).toBeTruthy();
    const agRows = (await sql`
      select status, categoria_produto_id, cliente_id from agendamentos where id = ${agendamentoId}`) as
      { status: string; categoria_produto_id: string; cliente_id: string }[];
    expect(agRows[0].status).toBe('pre_agendado');
    expect(agRows[0].categoria_produto_id).toBe(categoriaId);
    expect(agRows[0].cliente_id).toBe(clienteId);

    const conflitanteId = await ag.createAgendamento({
      cliente_id: clienteId, local_id: localId, estudio_id: estudio.id, categoria_produto_id: categoriaId,
      status: 'agendado', data: '2026-09-11', hora_inicio: '14:00', hora_fim: '15:00',
    });
    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: true,
        data: '2026-09-11', hora_inicio: '14:30', hora_fim: '15:30', local_id: localId, estudio_id: estudio.id,
      }],
    })).rejects.toThrow(os.ConflitoAgendaError);
    const consumidoDepoisConflito = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    // Task 4: a OS reserva, não consome, na criação.
    expect(consumidoDepoisConflito[0].quantidade_reservada).toBe(1);
    expect(consumidoDepoisConflito[0].quantidade_consumida).toBe(0);

    const tarefaGerada = (await sql`
      select agendamento_id, coluna, consumido from tarefas where cliente_id = ${clienteId}`) as
      { agendamento_id: string | null; coluna: string; consumido: boolean }[];
    expect(tarefaGerada).toHaveLength(1);
    expect(tarefaGerada[0].agendamento_id).toBe(agendamentoId);
    expect(tarefaGerada[0].coluna).toBe('a_fazer');
    expect(tarefaGerada[0].consumido).toBe(false);

    const bloqueioId = await bloqueios.createBloqueio({
      estudio_id: estudio.id, data: '2026-09-12', hora_inicio: '09:00', hora_fim: '12:00', motivo: 'manutenção',
    });
    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 1, pre_agendar: true,
        data: '2026-09-12', hora_inicio: '10:00', hora_fim: '11:00', local_id: localId, estudio_id: estudio.id,
      }],
    })).rejects.toThrow(os.ConflitoAgendaError);

    await sql`delete from tarefas where cliente_id = ${clienteId}`;
    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from agendamentos where id in (${agendamentoId}, ${conflitanteId})`;
    await sql`delete from bloqueios_estudio where id = ${bloqueioId}`;
    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('duas linhas pré-agendadas da mesma OS pedindo o mesmo estúdio/horário se autoconflitam (achado Critical 3)', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const lg = await import('@/lib/db/locais-gravacao');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-6`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-6`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-6`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-os-6`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio OS 6' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 5,
    });

    // Ambas as checagens contra o banco (bloqueio + conflito) passam pra cada linha isolada —
    // o conflito só existe entre as duas linhas desta mesma OS, que ainda não foram gravadas.
    await expect(os.createOrdemServico({
      cliente_id: clienteId,
      itens: [
        {
          produto_id: produtoId, quantidade: 1, pre_agendar: true,
          data: '2026-09-20', hora_inicio: '09:00', hora_fim: '10:00', local_id: localId, estudio_id: estudio.id,
        },
        {
          produto_id: produtoId, quantidade: 1, pre_agendar: true,
          data: '2026-09-20', hora_inicio: '09:30', hora_fim: '10:30', local_id: localId, estudio_id: estudio.id,
        },
      ],
    })).rejects.toThrow(os.ConflitoAgendaError);

    // Nada deve ter sido gravado: nem a OS, nem consumo de saldo de nenhuma das duas linhas,
    // nem agendamento nenhum.
    const osRows = (await sql`select id from ordens_servico where cliente_id = ${clienteId}`) as { id: string }[];
    expect(osRows).toHaveLength(0);
    const item = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    expect(item[0].quantidade_reservada).toBe(0);
    expect(item[0].quantidade_consumida).toBe(0);
    const agRows = (await sql`
      select id from agendamentos where estudio_id = ${estudio.id} and data = '2026-09-20'`) as { id: string }[];
    expect(agRows).toHaveLength(0);
    const tarefasRows = (await sql`select id from tarefas where cliente_id = ${clienteId}`) as { id: string }[];
    expect(tarefasRows).toHaveLength(0);

    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('cancelamento devolve saldo, cancela agendamentos vinculados, e a OS some da lista', async () => {
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const lg = await import('@/lib/db/locais-gravacao');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-4`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-4`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-4`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });
    const localId = await lg.createLocal({
      nome: `${marca}-local-os-4`, endereco: null, responsavel: null, estudios: [{ nome: 'Estúdio OS 4' }],
    });
    const [estudio] = (await lg.getLocal(localId))!.estudios;

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 3,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 2, pre_agendar: true,
        data: '2026-09-15', hora_inicio: '09:00', hora_fim: '10:00', local_id: localId, estudio_id: estudio.id,
      }],
    });
    const [{ agendamento_id: agendamentoId }] = (await sql`
      select agendamento_id from os_itens where os_id = ${osId}`) as { agendamento_id: string }[];

    const antes = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    // Task 4: a OS reserva, não consome, na criação.
    expect(antes[0].quantidade_reservada).toBe(2);
    expect(antes[0].quantidade_consumida).toBe(0);

    const tarefasAntes = (await sql`
      select id, coluna, deleted_at from tarefas where cliente_id = ${clienteId}`) as
      { id: string; coluna: string; deleted_at: string | null }[];
    expect(tarefasAntes).toHaveLength(2);
    expect(tarefasAntes.every((t) => t.deleted_at === null)).toBe(true);

    await os.cancelarOrdemServico(osId);

    const depois = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    // Nenhuma das 2 tarefas foi consumida antes do cancelamento — a reserva inteira volta.
    expect(depois[0].quantidade_reservada).toBe(0);
    expect(depois[0].quantidade_consumida).toBe(0);

    const tarefasDepois = (await sql`
      select id, deleted_at from tarefas where id = any(${tarefasAntes.map((t) => t.id)})`) as
      { id: string; deleted_at: string | null }[];
    expect(tarefasDepois).toHaveLength(2);
    expect(tarefasDepois.every((t) => t.deleted_at !== null)).toBe(true);

    const agDepois = (await sql`select status from agendamentos where id = ${agendamentoId}`) as { status: string }[];
    expect(agDepois[0].status).toBe('cancelado');

    const lista = await os.listOrdensServico();
    expect(lista.map((o) => o.id)).not.toContain(osId);

    await expect(os.cancelarOrdemServico(osId)).rejects.toThrow();

    await sql`delete from tarefas where cliente_id = ${clienteId}`;
    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from agendamentos where id = ${agendamentoId}`;
    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from estudios where local_id = ${localId}`;
    await sql`delete from locais_gravacao where id = ${localId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  it('cancelamento com tarefas parcialmente concluídas só devolve a reserva das que não consumiram', async () => {
    // Ponto de atenção do brief (Task 4, item 6): depois desta task, uma OS pode ter parte
    // das unidades ainda reservadas e parte já consumida (a tarefa foi movida para Concluído
    // antes do cancelamento). Devolver `os_itens.quantidade` inteira cegamente creditaria
    // saldo que não existe — a devolução tem que vir do estado real das tarefas.
    const terceiros = await import('@/lib/db/terceiros');
    const cat = await import('@/lib/db/categorias-produto');
    const prod = await import('@/lib/db/produtos');
    const contr = await import('@/lib/db/contratacoes');
    const os = await import('@/lib/db/ordens-servico');
    const tf = await import('@/lib/db/tarefas');

    const clienteId = await terceiros.createTerceiro('clientes', {
      nome: `${marca}-cliente-os-7`, contato_responsavel: null, email: null,
      telefone: null, cidade: null, uf: null,
    });
    const categoriaId = await cat.createCategoria({
      nome: `${marca}-categoria-os-7`, unidade_consumo: null, atributos_molde: [], ativo: true,
    });
    const produtoId = await prod.createProduto({
      categoria_id: categoriaId, nome: `${marca}-produto-os-7`, descricao: null, atributos: {}, preco: 10, ativo: true,
    });

    const contratacaoId = await contr.createContratacao({
      cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null, quantidade: 3,
    });

    const osId = await os.createOrdemServico({
      cliente_id: clienteId,
      itens: [{
        produto_id: produtoId, quantidade: 3, pre_agendar: false,
        data: null, hora_inicio: null, hora_fim: null, local_id: null, estudio_id: null,
      }],
    });

    const tarefas = (await sql`
      select id from tarefas where cliente_id = ${clienteId} order by created_at`) as { id: string }[];
    expect(tarefas).toHaveLength(3);

    // Conclui só a primeira tarefa: reserva vira consumo para essa unidade.
    await tf.moverTarefa(tarefas[0].id, 'concluido');

    const antes = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    expect(antes[0].quantidade_reservada).toBe(2);
    expect(antes[0].quantidade_consumida).toBe(1);

    await os.cancelarOrdemServico(osId);

    // Só as 2 unidades ainda reservadas voltam; a unidade já consumida pela tarefa
    // concluída não é revertida pelo cancelamento da OS.
    const depois = (await sql`
      select quantidade_reservada, quantidade_consumida from contratacao_itens where contratacao_id = ${contratacaoId}`) as
      { quantidade_reservada: number; quantidade_consumida: number }[];
    expect(depois[0].quantidade_reservada).toBe(0);
    expect(depois[0].quantidade_consumida).toBe(1);

    // As 3 tarefas da OS, consumida ou não, são soft-deletadas pelo cancelamento (brief: OS
    // cancelada some da lista principal, e o card não fica órfão no quadro).
    const tarefasDepois = (await sql`
      select id, deleted_at, consumido from tarefas where id = any(${tarefas.map((t) => t.id)})`) as
      { id: string; deleted_at: string | null; consumido: boolean }[];
    expect(tarefasDepois).toHaveLength(3);
    expect(tarefasDepois.every((t) => t.deleted_at !== null)).toBe(true);
    expect(tarefasDepois.find((t) => t.id === tarefas[0].id)!.consumido).toBe(true);

    await sql`delete from tarefas where cliente_id = ${clienteId}`;
    await sql`delete from ordens_servico where id = ${osId}`;
    await sql`delete from contratacao_itens where contratacao_id = ${contratacaoId}`;
    await sql`delete from contratacoes where id = ${contratacaoId}`;
    await sql`delete from produtos where id = ${produtoId}`;
    await sql`delete from categorias_produto where id = ${categoriaId}`;
    await sql`delete from clientes where id = ${clienteId}`;
  });

  describe('tarefas: reserva e consumo de saldo', () => {
    /** Monta cliente + categoria + produto + contratação avulsa de `quantidade`, e
     *  devolve o id do item de carteira já criado — base comum de todo teste do
     *  ciclo de saldo das tarefas. */
    async function montarCarteira(sufixo: string, quantidade: number) {
      const terceiros = await import('@/lib/db/terceiros');
      const cat = await import('@/lib/db/categorias-produto');
      const prod = await import('@/lib/db/produtos');
      const contr = await import('@/lib/db/contratacoes');

      const clienteId = await terceiros.createTerceiro('clientes', {
        nome: `${marca}-cliente-tarefa-${sufixo}`, contato_responsavel: null, email: null,
        telefone: null, cidade: null, uf: null,
      });
      const categoriaId = await cat.createCategoria({
        nome: `${marca}-categoria-tarefa-${sufixo}`, unidade_consumo: null, atributos_molde: [], ativo: true,
      });
      const produtoId = await prod.createProduto({
        categoria_id: categoriaId, nome: `${marca}-produto-tarefa-${sufixo}`, descricao: null,
        atributos: {}, preco: 10, ativo: true,
      });
      const contratacaoId = await contr.createContratacao({
        cliente_id: clienteId, tipo: 'avulso', produto_id: produtoId, combo_id: null, plano_id: null,
        quantidade,
      });
      const [{ id: contratacaoItemId }] = (await sql`
        select id from contratacao_itens where contratacao_id = ${contratacaoId}`) as { id: string }[];

      return { clienteId, categoriaId, produtoId, contratacaoId, contratacaoItemId };
    }

    async function limparCarteira(c: {
      clienteId: string; categoriaId: string; produtoId: string; contratacaoId: string;
    }) {
      await sql`delete from tarefas where cliente_id = ${c.clienteId}`;
      await sql`delete from contratacao_itens where contratacao_id = ${c.contratacaoId}`;
      await sql`delete from contratacoes where id = ${c.contratacaoId}`;
      await sql`delete from produtos where id = ${c.produtoId}`;
      await sql`delete from categorias_produto where id = ${c.categoriaId}`;
      await sql`delete from clientes where id = ${c.clienteId}`;
    }

    async function saldoAtual(contratacaoItemId: string) {
      const [linha] = (await sql`
        select quantidade_total, quantidade_reservada, quantidade_consumida
          from contratacao_itens where id = ${contratacaoItemId}`) as
        { quantidade_total: number; quantidade_reservada: number; quantidade_consumida: number }[];
      return linha;
    }

    it('criar tarefa reserva exatamente 1 do item de carteira', async () => {
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('cria', 3);

      const antes = await saldoAtual(c.contratacaoItemId);
      expect(antes.quantidade_reservada).toBe(0);

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });

      const depois = await saldoAtual(c.contratacaoItemId);
      expect(depois.quantidade_reservada).toBe(1);
      expect(depois.quantidade_consumida).toBe(0);

      const lista = await tf.listTarefas();
      expect(lista.map((t) => t.id)).toContain(tarefaId);

      await limparCarteira(c);
    });

    it('mover para Concluído troca reserva por consumo; sair de Concluído desfaz', async () => {
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('conclui', 3);

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });

      await tf.moverTarefa(tarefaId, 'concluido');
      const apósConcluir = await saldoAtual(c.contratacaoItemId);
      expect(apósConcluir.quantidade_reservada).toBe(0);
      expect(apósConcluir.quantidade_consumida).toBe(1);

      await tf.moverTarefa(tarefaId, 'a_fazer');
      const apósVoltar = await saldoAtual(c.contratacaoItemId);
      expect(apósVoltar.quantidade_reservada).toBe(1);
      expect(apósVoltar.quantidade_consumida).toBe(0);

      await limparCarteira(c);
    });

    it('apagar (soft-delete) libera a reserva', async () => {
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('apaga', 2);

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });
      expect((await saldoAtual(c.contratacaoItemId)).quantidade_reservada).toBe(1);

      await tf.softDeleteTarefa(tarefaId);
      expect((await saldoAtual(c.contratacaoItemId)).quantidade_reservada).toBe(0);

      const lista = await tf.listTarefas();
      expect(lista.map((t) => t.id)).not.toContain(tarefaId);

      await limparCarteira(c);
    });

    it('tarefa com agendamento_id indo para Concluído NÃO mexe no saldo (quem consome é o agendamento)', async () => {
      const tf = await import('@/lib/db/tarefas');
      const ag = await import('@/lib/db/agenda');
      const lg = await import('@/lib/db/locais-gravacao');
      const c = await montarCarteira('agendamento', 2);

      const localId = await lg.createLocal({
        nome: `${marca}-local-tarefa-agendamento`, endereco: null, responsavel: null,
        estudios: [{ nome: 'Estúdio tarefa' }],
      });
      const [estudio] = (await lg.getLocal(localId))!.estudios;
      const agendamentoId = await ag.createAgendamento({
        cliente_id: c.clienteId, local_id: localId, estudio_id: estudio.id,
        categoria_produto_id: c.categoriaId, status: 'agendado',
        data: '2026-09-30', hora_inicio: '09:00', hora_fim: '10:00',
      });

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'gravação', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });
      // `createTarefa` não aceita `agendamento_id` — é o próprio módulo de Agenda (Task 4,
      // fora deste escopo) quem vincularia. Aqui simulamos o vínculo direto na tarefa que
      // acabamos de criar, só para exercitar o guard de `moverTarefa`.
      await sql`update tarefas set agendamento_id = ${agendamentoId} where id = ${tarefaId}`;

      const antes = await saldoAtual(c.contratacaoItemId);
      expect(antes.quantidade_reservada).toBe(1);

      await tf.moverTarefa(tarefaId, 'concluido');

      const depois = await saldoAtual(c.contratacaoItemId);
      expect(depois.quantidade_reservada).toBe(1);
      expect(depois.quantidade_consumida).toBe(0);

      const [linhaTarefa] = (await sql`select consumido from tarefas where id = ${tarefaId}`) as
        { consumido: boolean }[];
      expect(linhaTarefa.consumido).toBe(false);

      // A tarefa referencia o agendamento via FK — precisa sumir antes dele.
      await sql`delete from tarefas where id = ${tarefaId}`;
      await sql`delete from agendamentos where id = ${agendamentoId}`;
      await sql`delete from estudios where local_id = ${localId}`;
      await sql`delete from locais_gravacao where id = ${localId}`;
      await limparCarteira(c);
    });

    it('criar tarefa sem saldo disponível rejeita com SaldoIndisponivelError e não altera o saldo', async () => {
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('semsaldo', 1);

      // Esgota o único saldo disponível.
      const primeiraId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição 1', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });

      const antes = await saldoAtual(c.contratacaoItemId);
      expect(antes.quantidade_reservada).toBe(1);

      await expect(tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição 2', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      })).rejects.toThrow(tf.SaldoIndisponivelError);

      const depois = await saldoAtual(c.contratacaoItemId);
      expect(depois.quantidade_reservada).toBe(1);
      expect(depois.quantidade_consumida).toBe(0);

      await tf.softDeleteTarefa(primeiraId);
      await limparCarteira(c);
    });

    it('N criações concorrentes com saldo para 1 só: uma vence, o resto perde com SaldoIndisponivelError e o saldo não passa de 1 reservado', async () => {
      // NÃO pina o guard-in-where do CTE de reserva (`and quantidade_total -
      // quantidade_reservada - quantidade_consumida >= 1`, lib/db/tarefas.ts ~linha 98).
      // Isso foi tentado e não funciona neste driver: `sql` é neon-http — cada chamada é
      // um round-trip HTTP isolado, sem transação compartilhada entre chamadas
      // concorrentes. Empiricamente (`Promise.allSettled` disparando 10 e depois 50
      // chamadas simultâneas de `createTarefa` contra uma disponibilidade de 1) a
      // execução sempre serializa de ponta a ponta: exatamente 1 chamada conclui a leitura
      // preliminar + CTE + insert antes de qualquer outra sequer terminar sua leitura
      // preliminar, então as N-1 rejeições saem 100% das vezes por `origem: 'checagem'` —
      // nunca `origem: 'corrida'`. Ou seja, o caminho pós-CTE (guard-in-where) parece
      // inalcançável pela API pública neste ambiente/driver; ver relatório da Task 3 para
      // o experimento completo (remover o guard, rodar, restaurar).
      //
      // O que este teste verifica de fato: sob N chamadas concorrentes reais (via
      // `Promise.allSettled`, não `all`, para não mascarar o resultado de umas com o das
      // outras), o resultado observável — 1 sucesso, resto rejeitado, saldo nunca excede a
      // disponibilidade — se mantém. Isso cobre a checagem preliminar e a ausência de
      // sobre-reserva, mas não substitui uma prova direta do guard-in-where.
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('concorrencia', 1);

      const dados = {
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição concorrente', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      };

      const N = 10;
      const resultados = await Promise.allSettled(
        Array.from({ length: N }, () => tf.createTarefa(dados)),
      );

      const cumpridas = resultados.filter(
        (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
      );
      const rejeitadas = resultados.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(cumpridas).toHaveLength(1);
      expect(rejeitadas).toHaveLength(N - 1);
      for (const r of rejeitadas) expect(r.reason).toBeInstanceOf(tf.SaldoIndisponivelError);

      const saldo = await saldoAtual(c.contratacaoItemId);
      expect(saldo.quantidade_reservada).toBe(1);
      expect(saldo.quantidade_consumida).toBe(0);

      await limparCarteira(c);
    });

    it('apagar tarefa já convertida em consumo (Concluído) não libera reserva que não existe mais', async () => {
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('apaga-consumida', 2);

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });

      await tf.moverTarefa(tarefaId, 'concluido');
      const apósConcluir = await saldoAtual(c.contratacaoItemId);
      expect(apósConcluir.quantidade_reservada).toBe(0);
      expect(apósConcluir.quantidade_consumida).toBe(1);

      await tf.softDeleteTarefa(tarefaId);
      const depois = await saldoAtual(c.contratacaoItemId);
      expect(depois.quantidade_reservada).toBe(0);
      expect(depois.quantidade_consumida).toBe(1);

      await limparCarteira(c);
    });

    it('flag ajuste: liga saindo de Homologação, desliga chegando em Concluído, preserva nos demais casos', async () => {
      const tf = await import('@/lib/db/tarefas');
      const c = await montarCarteira('ajuste', 3);

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'edição', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });

      const lerAjuste = async () => {
        const [linha] = (await sql`
          select ajuste from tarefas where id = ${tarefaId}`) as { ajuste: boolean }[];
        return linha.ajuste;
      };

      expect(await lerAjuste()).toBe(false);

      // roadmap -> homologacao_cliente: chegar em Homologação não liga nada.
      await tf.moverTarefa(tarefaId, 'homologacao_cliente');
      expect(await lerAjuste()).toBe(false);

      // homologacao_cliente -> a_fazer (não é Concluído): saiu de Homologação, liga.
      await tf.moverTarefa(tarefaId, 'a_fazer');
      expect(await lerAjuste()).toBe(true);

      // a_fazer -> executando: fora dos dois casos especiais, preserva o que já estava.
      // É esse o branch que uma implementação errada mais fácil regride silenciosamente.
      await tf.moverTarefa(tarefaId, 'executando');
      expect(await lerAjuste()).toBe(true);

      // executando -> concluido: chegar em Concluído desliga, mesmo estando ligada.
      await tf.moverTarefa(tarefaId, 'concluido');
      expect(await lerAjuste()).toBe(false);

      await tf.softDeleteTarefa(tarefaId);
      await limparCarteira(c);
    });

    it('agendamento indo para Concluído consome pelas tarefas vinculadas; salvar de novo não duplica; sair de Concluído devolve', async () => {
      const tf = await import('@/lib/db/tarefas');
      const ag = await import('@/lib/db/agenda');
      const lg = await import('@/lib/db/locais-gravacao');
      const c = await montarCarteira('agenda-consome', 2);

      const localId = await lg.createLocal({
        nome: `${marca}-local-agenda-consome`, endereco: null, responsavel: null,
        estudios: [{ nome: 'Estúdio agenda consome' }],
      });
      const [estudio] = (await lg.getLocal(localId))!.estudios;
      const agendamentoId = await ag.createAgendamento({
        cliente_id: c.clienteId, local_id: localId, estudio_id: estudio.id,
        categoria_produto_id: c.categoriaId, status: 'agendado',
        data: '2026-10-05', hora_inicio: '09:00', hora_fim: '10:00',
      });

      const tarefaId = await tf.createTarefa({
        cliente_id: c.clienteId, responsavel_id: null, contratacao_item_id: c.contratacaoItemId,
        tarefa: 'gravação agendada', coluna: 'roadmap', prioridade: 0,
        deadline_cliente: null, deadline_tarefa: null,
      });
      // Mesmo artifício dos outros testes deste bloco: `createTarefa` não aceita
      // `agendamento_id`, então o vínculo é simulado direto no banco.
      await sql`update tarefas set agendamento_id = ${agendamentoId} where id = ${tarefaId}`;

      const dadosBase = {
        cliente_id: c.clienteId, local_id: localId, estudio_id: estudio.id,
        categoria_produto_id: c.categoriaId,
        data: '2026-10-05', hora_inicio: '09:00', hora_fim: '10:00',
      };

      const lerConsumido = async () => {
        const [linha] = (await sql`select consumido from tarefas where id = ${tarefaId}`) as
          { consumido: boolean }[];
        return linha.consumido;
      };

      expect((await saldoAtual(c.contratacaoItemId)).quantidade_reservada).toBe(1);
      expect(await lerConsumido()).toBe(false);

      // Concluir consome: reserva vira consumo, tarefa marca `consumido = true`.
      await ag.updateAgendamento(agendamentoId, { ...dadosBase, status: 'concluido' });
      const apósConcluir = await saldoAtual(c.contratacaoItemId);
      expect(apósConcluir.quantidade_reservada).toBe(0);
      expect(apósConcluir.quantidade_consumida).toBe(1);
      expect(await lerConsumido()).toBe(true);

      // Salvar de novo o mesmo agendamento já concluído não pode debitar segunda vez — é
      // o filtro `consumido = false` no update de `tarefas`, não a diferença entre status
      // antigo e novo, que garante isso (updateAgendamento roda a rotina de consumo em
      // toda chamada com status = 'concluido', não só numa transição).
      await ag.updateAgendamento(agendamentoId, { ...dadosBase, status: 'concluido' });
      const apósRepetir = await saldoAtual(c.contratacaoItemId);
      expect(apósRepetir.quantidade_reservada).toBe(0);
      expect(apósRepetir.quantidade_consumida).toBe(1);
      expect(await lerConsumido()).toBe(true);

      // Sair de Concluído devolve: consumo volta a ser reserva, tarefa desmarca.
      await ag.updateAgendamento(agendamentoId, { ...dadosBase, status: 'agendado' });
      const apósVoltar = await saldoAtual(c.contratacaoItemId);
      expect(apósVoltar.quantidade_reservada).toBe(1);
      expect(apósVoltar.quantidade_consumida).toBe(0);
      expect(await lerConsumido()).toBe(false);

      await sql`delete from tarefas where id = ${tarefaId}`;
      await sql`delete from agendamentos where id = ${agendamentoId}`;
      await sql`delete from estudios where local_id = ${localId}`;
      await sql`delete from locais_gravacao where id = ${localId}`;
      await limparCarteira(c);
    });
  });
});
