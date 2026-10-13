import { Building2, Boxes, CalendarClock, CalendarDays, ClipboardList, Cpu, FolderKanban, Home, Kanban, LayoutDashboard, Layers, MapPin, Package, ScrollText, ShoppingCart, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { modulosDoAtor } from '@/lib/auth/guards';
import type { ModuleKey } from '@/lib/modules';
import type { Actor } from '@/lib/types';
import { SidebarShell, type SidebarGroup } from './SidebarShell';

export async function Sidebar({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  // Só cosmético: a barreira real é `requireModulo()` em cada página e action.
  const liberados = await modulosDoAtor(actor);
  const tem = (key: ModuleKey) => liberados.includes(key);

  const iconClass = 'shrink-0';
  const groups: SidebarGroup[] = [
    ...(tem('painel')
      ? [{
          label: 'Painel',
          icon: <LayoutDashboard size={18} className={iconClass} />,
          items: [{ href: '/', label: 'Painel', icon: <LayoutDashboard size={18} className={iconClass} /> }],
        }]
      : []),
    // Working: gestão de tarefas internas da 4Nexus.
    ...(tem('working')
      ? [{
          label: 'Working',
          icon: <Kanban size={18} className={iconClass} />,
          items: [{ href: '/working/planejamento', label: 'Planejamento', icon: <Kanban size={18} className={iconClass} /> }],
        }]
      : []),
    // Pessoas: "Usuários" (Meus dados) é de todo usuário ativo; Clientes, Fornecedores
    // e Locais são áreas liberáveis.
    {
      label: 'Pessoas',
      icon: <UserSquare2 size={18} className={iconClass} />,
      items: [
        { href: '/usuarios', label: 'Usuários', icon: <Users size={18} className={iconClass} /> },
        ...(tem('clientes')
          ? [
              {
                href: '/cadastros/clientes', label: 'Clientes',
                icon: <Building2 size={18} className={iconClass} />,
              },
            ]
          : []),
        ...(tem('fornecedores')
          ? [
              {
                href: '/cadastros/fornecedores', label: 'Fornecedores',
                icon: <Truck size={18} className={iconClass} />,
              },
            ]
          : []),
        ...(tem('locais_gravacao')
          ? [
              {
                href: '/cadastros/locais-gravacao', label: 'Locais de Gravação',
                icon: <MapPin size={18} className={iconClass} />,
              },
            ]
          : []),
      ],
    },
    ...(tem('produtos')
      ? [{
          label: 'Produtos',
          icon: <Package size={18} className={iconClass} />,
          items: [
            { href: '/produtos/categorias', label: 'Categorias', icon: <Layers size={18} className={iconClass} /> },
            { href: '/produtos', label: 'Produtos', icon: <Boxes size={18} className={iconClass} /> },
            { href: '/produtos/combos', label: 'Combos', icon: <Package size={18} className={iconClass} /> },
            { href: '/produtos/planos', label: 'Planos', icon: <CalendarClock size={18} className={iconClass} /> },
          ],
        }]
      : []),
    ...(tem('agenda')
      ? [{ label: 'Agenda', icon: <CalendarDays size={18} className={iconClass} />, items: [{ href: '/agenda', label: 'Agenda', icon: <CalendarDays size={18} className={iconClass} /> }] }]
      : []),
    ...(tem('contratacoes')
      ? [{
          label: 'Contratações',
          icon: <ShoppingCart size={18} className={iconClass} />,
          items: [{ href: '/contratacoes', label: 'Contratações', icon: <ShoppingCart size={18} className={iconClass} /> }],
        }]
      : []),
    ...(tem('ordens_servico')
      ? [{
          label: 'Ordens de Serviço',
          icon: <ClipboardList size={18} className={iconClass} />,
          items: [{ href: '/ordens-servico', label: 'Ordens de Serviço', icon: <ClipboardList size={18} className={iconClass} /> }],
        }]
      : []),
    ...(tem('ti')
      ? [{
          label: 'TI',
          icon: <Cpu size={18} className={iconClass} />,
          items: [{ href: '/ti', label: 'Projetos de TI', icon: <Cpu size={18} className={iconClass} /> }],
        }]
      : []),
    {
      label: 'Cofre de Senhas',
      icon: <Vault size={18} className={iconClass} />,
      items: [
        { href: '/senhas', label: 'Salas', icon: <Home size={18} className={iconClass} /> },
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
