import { Building2, FolderKanban, Home, ScrollText, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { canManageTerceiros } from '@/lib/authz';
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
    // Cadastros primeiro: hub de dados compartilhados (usuário, cliente, e o que
    // vier depois) — vive dentro do próprio Cofre, sem gate de module_access.
    {
      label: 'Cadastros',
      icon: <UserSquare2 size={18} className={iconClass} />,
      items: [
        { href: '/usuarios', label: 'Usuários', icon: <Users size={18} className={iconClass} /> },
        ...(canManageTerceiros(actor)
          ? [
              {
                href: '/cadastros/clientes', label: 'Clientes',
                icon: <Building2 size={18} className={iconClass} />,
              },
              {
                href: '/cadastros/fornecedores', label: 'Fornecedores',
                icon: <Truck size={18} className={iconClass} />,
              },
            ]
          : []),
      ],
    },
    // Cada módulo externo ganha seu próprio grupo de topo (não mais agrupado sob
    // um "Módulos" genérico), lado a lado com Cadastros e Cofre de Senhas.
    ...modulosVisiveis.map((m) => {
      const Icon = m.icon;
      return {
        label: m.groupLabel,
        icon: <Icon size={18} className={iconClass} />,
        items: [{ href: m.href, label: m.label, icon: <Icon size={18} className={iconClass} /> }],
      };
    }),
    {
      label: 'Cofre de Senhas',
      icon: <Vault size={18} className={iconClass} />,
      items: [
        { href: '/', label: 'Salas', icon: <Home size={18} className={iconClass} /> },
        ...(actor.role === 'master'
          ? [
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
