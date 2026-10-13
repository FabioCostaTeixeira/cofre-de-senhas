import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

config({ path: '.env.local' });
config();

const temBanco = Boolean(process.env.DATABASE_URL);
const descreve = temBanco ? describe : describe.skip;
const marca = `teste-ti-${Date.now()}`;

descreve('integração do módulo TI', () => {
  let sql: typeof import('@/lib/db/client')['sql'];
  let ti: typeof import('@/lib/db/ti');
  let tarefasDb: typeof import('@/lib/db/ti-tarefas');
  const projetoIds: string[] = [];

  beforeAll(async () => {
    sql = (await import('@/lib/db/client')).sql;
    ti = await import('@/lib/db/ti');
    tarefasDb = await import('@/lib/db/ti-tarefas');
  });

  afterAll(async () => {
    if (!temBanco || projetoIds.length === 0) return;
    await sql`delete from ti_atividades where tarefa_id in (select id from ti_tarefas where projeto_id = any(${projetoIds}))`;
    await sql`delete from ti_tarefas where projeto_id = any(${projetoIds})`;
    await sql`delete from ti_projetos where id = any(${projetoIds})`;
  });

  it('tem schema TI completo, colunas de peso e ordem, e cascata nos pais', async () => {
    const tabelas = (await sql`
      select relname
        from pg_class
       where relkind = 'r'
         and relname = any(array['ti_projetos', 'ti_tarefas', 'ti_atividades'])
    `) as { relname: string }[];
    expect(tabelas.map((tabela) => tabela.relname)).toEqual(expect.arrayContaining([
      'ti_projetos', 'ti_tarefas', 'ti_atividades',
    ]));

    const colunas = (await sql`
      select table_name, column_name
        from information_schema.columns
       where table_schema = 'public'
         and table_name in ('ti_tarefas', 'ti_atividades')
         and column_name in ('peso', 'ordem')
    `) as { table_name: string; column_name: string }[];
    expect(colunas).toEqual(expect.arrayContaining([
      { table_name: 'ti_tarefas', column_name: 'peso' },
      { table_name: 'ti_tarefas', column_name: 'ordem' },
      { table_name: 'ti_atividades', column_name: 'peso' },
      { table_name: 'ti_atividades', column_name: 'ordem' },
    ]));

    const projetoId = await criarProjeto(`${marca}-cascata`);
    const tarefaId = randomUUID();
    const atividadeId = randomUUID();
    await sql`
      insert into ti_tarefas (id, projeto_id, nome, status, prioridade, peso, ordem)
      values (${tarefaId}, ${projetoId}, 'Feature', 'a_fazer', 'media', 100, 0)
    `;
    await sql`
      insert into ti_atividades (id, tarefa_id, nome, status, prioridade, peso, ordem)
      values (${atividadeId}, ${tarefaId}, 'Story', 'a_fazer', 'media', 100, 0)
    `;

    await sql`delete from ti_projetos where id = ${projetoId}`;
    expect((await sql`select id from ti_tarefas where id = ${tarefaId}`)).toHaveLength(0);
    expect((await sql`select id from ti_atividades where id = ${atividadeId}`)).toHaveLength(0);
    const indice = projetoIds.indexOf(projetoId);
    if (indice >= 0) projetoIds.splice(indice, 1);
  });

  async function criarProjeto(nome: string): Promise<string> {
    const id = randomUUID();
    projetoIds.push(id);
    await sql`
      insert into ti_projetos (id, nome, descricao, status, prioridade, responsavel)
      values (${id}, ${nome}, 'Descrição', 'backlog', 'media', 'Responsável')
    `;
    return id;
  }

  it('duplica projeto com novas tarefas e atividades independentes', async () => {
    const projetoId = await criarProjeto(`${marca}-origem`);
    const tarefaId = randomUUID();
    const atividadeId = randomUUID();
    await sql`
      insert into ti_tarefas (id, projeto_id, nome, descricao, status, prioridade, responsavel, peso, ordem)
      values (${tarefaId}, ${projetoId}, 'Feature original', 'Detalhes', 'a_fazer', 'alta', 'Pessoa', 100, 3)
    `;
    await sql`
      insert into ti_atividades (id, tarefa_id, nome, descricao, status, prioridade, responsavel, peso, ordem)
      values (${atividadeId}, ${tarefaId}, 'Story original', 'Critérios', 'progresso', 'critica', 'Pessoa', 100, 2)
    `;

    const copiaId = await ti.duplicateTiProjeto(projetoId);
    expect(copiaId).toBeTruthy();
    projetoIds.push(copiaId!);

    const projetos = (await sql`select nome from ti_projetos where id = ${copiaId}`) as { nome: string }[];
    const tarefas = (await sql`
      select id, nome, peso::float as peso, ordem
        from ti_tarefas
       where projeto_id = ${copiaId}
    `) as { id: string; nome: string; peso: number; ordem: number }[];
    const atividades = (await sql`
      select id, tarefa_id, nome, peso::float as peso, ordem
        from ti_atividades
       where tarefa_id = ${tarefas[0].id}
    `) as { id: string; tarefa_id: string; nome: string; peso: number; ordem: number }[];

    expect(projetos[0].nome).toBe(`${marca}-origem (Cópia)`);
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]).toMatchObject({ nome: 'Feature original', peso: 100, ordem: 3 });
    expect(tarefas[0].id).not.toBe(tarefaId);
    expect(atividades).toHaveLength(1);
    expect(atividades[0]).toMatchObject({ tarefa_id: tarefas[0].id, nome: 'Story original', peso: 100, ordem: 2 });
    expect(atividades[0].id).not.toBe(atividadeId);
  });

  it('duplica projeto sem tarefas', async () => {
    const projetoId = await criarProjeto(`${marca}-vazio`);
    const copiaId = await ti.duplicateTiProjeto(projetoId);
    expect(copiaId).toBeTruthy();
    projetoIds.push(copiaId!);
    expect(await tarefasDb.listTiTarefas(copiaId!)).toHaveLength(0);
  });

  it('move User Story para tarefa existente e rebalanceia os dois pais', async () => {
    const projetoOrigemId = await criarProjeto(`${marca}-projeto-a`);
    const projetoDestinoId = await criarProjeto(`${marca}-projeto-b`);
    const tarefaOrigemId = randomUUID();
    const tarefaDestinoId = randomUUID();
    const movidaId = randomUUID();
    const origemRestanteId = randomUUID();
    const destinoExistenteId = randomUUID();

    await sql`
      insert into ti_tarefas (id, projeto_id, nome, status, prioridade, peso, ordem)
      values
        (${tarefaOrigemId}, ${projetoOrigemId}, 'Origem', 'a_fazer', 'media', 100, 0),
        (${tarefaDestinoId}, ${projetoDestinoId}, 'Destino', 'a_fazer', 'media', 100, 0)
    `;
    await sql`
      insert into ti_atividades (id, tarefa_id, nome, status, prioridade, peso, ordem)
      values
        (${movidaId}, ${tarefaOrigemId}, 'Movida', 'a_fazer', 'media', 50, 0),
        (${origemRestanteId}, ${tarefaOrigemId}, 'Permanece', 'a_fazer', 'media', 50, 1),
        (${destinoExistenteId}, ${tarefaDestinoId}, 'Existente', 'a_fazer', 'media', 100, 0)
    `;

    const resultado = await tarefasDb.updateTiAtividade({
      id: movidaId,
      tarefaId: tarefaDestinoId,
      nome: 'Movida',
      descricao: null,
      status: 'a_fazer',
      prioridade: 'media',
      responsavel: null,
      peso: 40,
    });

    expect(resultado).toMatchObject({
      tarefaAnteriorId: tarefaOrigemId,
      tarefaNovaId: tarefaDestinoId,
      projetoAnteriorId: projetoOrigemId,
      projetoNovoId: projetoDestinoId,
    });

    const origem = await tarefasDb.listTiAtividades(tarefaOrigemId);
    const destino = await tarefasDb.listTiAtividades(tarefaDestinoId);
    expect(origem).toHaveLength(1);
    expect(Number(origem[0].peso)).toBe(100);
    expect(destino.map((a) => [a.id, Number(a.peso)])).toEqual(expect.arrayContaining([
      [movidaId, 40],
      [destinoExistenteId, 60],
    ]));
  });
});
