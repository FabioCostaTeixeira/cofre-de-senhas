import { FolderKanban, Home, ScrollText, Trash2, Users } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { listModulesOfUser } from '@/lib/db/queries';
import { MODULES } from '@/lib/modules';
import type { Actor } from '@/lib/types';
import { SidebarShell, type SidebarGroup } from './SidebarShell';

export async function Sidebar({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const modulosLiberados =
    actor.role === 'master' ? MODULES.map((m) => m.key) : await listModulesOfUser(actor.id);
  const modulosVisiveis = MODULES.filter((m) => modulosLiberados.includes(m.key));

  const groups: SidebarGroup[] = [
    {
      label: 'Cofre de Senhas',
      items: [
        { href: '/', label: 'Salas', icon: Home },
        ...(actor.role === 'master'
          ? [
              { href: '/admin/usuarios', label: 'Usuários', icon: Users },
              { href: '/admin/salas', label: 'Salas (admin)', icon: FolderKanban },
              { href: '/admin/auditoria', label: 'Auditoria', icon: ScrollText },
              { href: '/admin/lixeira', label: 'Lixeira', icon: Trash2 },
            ]
          : []),
      ],
    },
    ...(modulosVisiveis.length > 0
      ? [{
          label: 'Módulos',
          items: modulosVisiveis.map((m) => ({ href: m.href, label: m.label, icon: m.icon })),
        }]
      : []),
  ];

  return (
    <SidebarShell groups={groups} actorName={actor.name} logoutAction={logout}>
      {children}
    </SidebarShell>
  );
}
