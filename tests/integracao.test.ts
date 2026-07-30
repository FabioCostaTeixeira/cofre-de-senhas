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

  type Ator = import('@/lib/types').Actor;
  let master: Ator;
  let comum: Ator;
  let estranho: Ator;

  beforeAll(async () => {
    sql = (await import('@/lib/db/client')).sql;
    q = await import('@/lib/db/queries');

    const cria = async (email: string, role: 'master' | 'user') => {
      const linhas = (await sql`
        insert into users (email, name, password_hash, role, must_change_password)
        values (${`${marca}-${email}`}, ${email}, 'nao-usado', ${role}, false)
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
});
