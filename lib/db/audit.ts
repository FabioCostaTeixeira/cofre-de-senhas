import { sql } from '@/lib/db/client';
import { sanitizeAuditMetadata } from '@/lib/db/auditSanitize';
import type { AuditAction } from '@/lib/types';

type Entry = {
  actorId: string | null;
  action: AuditAction;
  entityType?: 'credential' | 'room' | 'user' | 'cliente' | 'fornecedor' | 'categoria_produto'
    | 'produto' | 'combo' | 'plano' | 'local_gravacao' | 'estudio' | 'agendamento' | 'bloqueio_estudio';
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Nunca receba senha em claro no metadata. Além do combinado por convenção, o
 * metadata passa por `sanitizeAuditMetadata` antes de gravar: qualquer chave com
 * nome suspeito (senha/password/secret/token/hash/chave) é removida em vez de
 * abortar a gravação inteira do registro de auditoria.
 */
export async function audit(e: Entry): Promise<void> {
  const metadata = sanitizeAuditMetadata(e.metadata ?? {});
  await sql`
    insert into audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (${e.actorId}, ${e.action}, ${e.entityType ?? null}, ${e.entityId ?? null},
            ${JSON.stringify(metadata)}::jsonb)`;
}

export type AuditRow = {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const TAMANHO_PAGINA = 50;

export type AuditPage = {
  linhas: AuditRow[];
  /** Há uma próxima página além da atual. */
  temProxima: boolean;
};

/**
 * `pagina` é 1-based. Busca uma linha a mais que o necessário só para saber se
 * existe próxima página, sem precisar de um `count(*)` separado sobre a tabela
 * inteira de auditoria.
 */
export async function listAudit(pagina = 1, action?: string): Promise<AuditPage> {
  const offset = (Math.max(1, pagina) - 1) * TAMANHO_PAGINA;
  const linhas = (action
    ? await sql`
        select a.id, u.name as actor_name, a.action, a.entity_type, a.entity_id,
               a.metadata, a.created_at
          from audit_log a left join users u on u.id = a.actor_id
         where a.action = ${action}
         order by a.created_at desc limit ${TAMANHO_PAGINA + 1} offset ${offset}`
    : await sql`
        select a.id, u.name as actor_name, a.action, a.entity_type, a.entity_id,
               a.metadata, a.created_at
          from audit_log a left join users u on u.id = a.actor_id
         order by a.created_at desc limit ${TAMANHO_PAGINA + 1} offset ${offset}`
  ) as AuditRow[];

  return {
    linhas: linhas.slice(0, TAMANHO_PAGINA),
    temProxima: linhas.length > TAMANHO_PAGINA,
  };
}
