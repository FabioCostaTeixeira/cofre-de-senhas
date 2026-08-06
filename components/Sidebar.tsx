import { FolderKanban, Folders, Home, ScrollText, Trash2, Users, Vault } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { listModulesOfUser } from '@/lib/db/queries';
import { MODULES } from '@/lib/modules';
import type { Actor } from '@/lib/types';
import { SidebarShell, type SidebarGroup } from './SidebarShell';

export async function Sidebar({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const modulosLiberados =
    actor.role === 'master' ? MODULES.map((m) => m.key) : await listModulesOfUser(actor.id);
  const modulosVisiveis = MODULES.filter((m) => modulosLiberados.includes(m.key));

  const iconClass = 'shrink-0';
  const groups: SidebarGroup[] = [
    // Módulos primeiro: o Cofre é o hub, e os outros módulos do ecossistema
    // ganham o topo do menu em vez de ficarem abaixo das rotas do próprio Cofre.
    ...(modulosVisiveis.length > 0
      ? [{
          label: 'Módulos',
          icon: <Folders size={18} className={iconClass} />,
          items: modulosVisiveis.map((m) => {
            const Icon = m.icon;
            return { href: m.href, label: m.label, icon: <Icon size={18} className={iconClass} /> };
          }),
        }]
      : []),
    {
      label: 'Cofre de Senhas',
      icon: <Vault size={18} className={iconClass} />,
      items: [
        { href: '/', label: 'Salas', icon: <Home size={18} className={iconClass} /> },
        ...(actor.role === 'master'
          ? [
              {
                href: '/admin/usuarios', label: 'Usuários',
                icon: <Users size={18} className={iconClass} />,
              },
              {
                href: '/admin/salas', label: 'Salas (admin)',
                icon: <FolderKanban size={18} className={iconClass} />,
              },
              {
                href: '/admin/auditoria', label: 'Auditoria',
                icon: <ScrollText size={18} className={iconClass} />,
              },
              {
                href: '/admin/lixeira', label: 'Lixeira',
                icon: <Trash2 size={18} className={iconClass} />,
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <SidebarShell groups={groups} actorName={actor.name} logoutAction={logout}>
      {children}
    </SidebarShell>
  );
}
