import { sql } from '@/lib/db/client';
import type { AuditAction } from '@/lib/types';

type Entry = {
  actorId: string | null;
  action: AuditAction;
  entityType?: 'credential' | 'room' | 'user';
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Nunca receba senha em claro no metadata. */
export async function audit(e: Entry): Promise<void> {
  await sql`
    insert into audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (${e.actorId}, ${e.action}, ${e.entityType ?? null}, ${e.entityId ?? null},
            ${JSON.stringify(e.metadata ?? {})}::jsonb)`;
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

export async function listAudit(limit = 200, action?: string): Promise<AuditRow[]> {
  if (action) {
    return (await sql`
      select a.id, u.name as actor_name, a.action, a.entity_type, a.entity_id,
             a.metadata, a.created_at
        from audit_log a left join users u on u.id = a.actor_id
       where a.action = ${action}
       order by a.created_at desc limit ${limit}`) as AuditRow[];
  }
  return (await sql`
    select a.id, u.name as actor_name, a.action, a.entity_type, a.entity_id,
           a.metadata, a.created_at
      from audit_log a left join users u on u.id = a.actor_id
     order by a.created_at desc limit ${limit}`) as AuditRow[];
}
