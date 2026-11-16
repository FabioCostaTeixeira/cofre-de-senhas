import { sql } from '@/lib/db/client';
import { assertUuid } from '@/lib/validation';

/** Notificação interna (sino do menu). Ver migração 020. */
export type Notificacao = {
  id: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
};

export type NovaNotificacao = { titulo: string; mensagem?: string | null; link?: string | null };

/** Uma notificação para cada gestor ativo, menos quem disparou a ação (não faz sentido
 *  avisar alguém do que ele mesmo acabou de fazer). Devolve quantas foram criadas. */
export async function notificarGestores(dados: NovaNotificacao, excetoId?: string): Promise<number> {
  if (excetoId) assertUuid(excetoId);
  const exceto = excetoId ?? null;
  const rows = (await sql`
    insert into notificacoes (usuario_id, titulo, mensagem, link)
    select u.id, ${dados.titulo}, ${dados.mensagem ?? null}, ${dados.link ?? null}
      from users u
     where u.role = 'gestor' and u.is_active and u.data_demissao is null
       and (${exceto}::uuid is null or u.id <> ${exceto})
    returning id`) as { id: string }[];
  return rows.length;
}

/** Roda no menu de toda página: falha aqui (ex.: migração 020 ainda não aplicada) vira
 *  zero em vez de derrubar a aplicação inteira por causa de um contador. */
export async function contarNaoLidas(usuarioId: string): Promise<number> {
  assertUuid(usuarioId);
  try {
    const rows = (await sql`
      select count(*)::int as total from notificacoes
       where usuario_id = ${usuarioId} and lida_em is null`) as { total: number }[];
    return rows[0]?.total ?? 0;
  } catch (e) {
    console.error('Falha ao contar notificações', e);
    return 0;
  }
}

/** As mais recentes primeiro; limitado para a tela não crescer sem fim. */
export async function listNotificacoes(usuarioId: string, limite = 100): Promise<Notificacao[]> {
  assertUuid(usuarioId);
  return (await sql`
    select id, titulo, mensagem, link, (lida_em is not null) as lida, created_at::text as created_at
      from notificacoes
     where usuario_id = ${usuarioId}
     order by created_at desc
     limit ${limite}`) as Notificacao[];
}

/** Sem `id`, marca todas do usuário. A `where` sempre amarra ao dono. */
export async function marcarLidas(usuarioId: string, id?: string): Promise<void> {
  assertUuid(usuarioId);
  if (id) assertUuid(id);
  const alvo = id ?? null;
  await sql`
    update notificacoes set lida_em = now()
     where usuario_id = ${usuarioId} and lida_em is null
       and (${alvo}::uuid is null or id = ${alvo})`;
}
