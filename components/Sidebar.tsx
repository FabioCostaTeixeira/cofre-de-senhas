import { Building2, Boxes, CalendarClock, CalendarDays, ClipboardList, FolderKanban, Home, Kanban, LayoutDashboard, Layers, MapPin, Package, ScrollText, ShoppingCart, Trash2, Truck, UserSquare2, Users, Vault } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { canManageAgenda, canManageContratacoes, canManageLocaisGravacao, canManageOrdensServico, canManageProdutos, canManageTerceiros } from '@/lib/authz';
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
    {
      label: 'Painel',
      icon: <LayoutDashboard size={18} className={iconClass} />,
      items: [{ href: '/', label: 'Painel', icon: <LayoutDashboard size={18} className={iconClass} /> }],
    },
    // Working: gestão de tarefas internas da 4Nexus. Hub interno como Painel/Pessoas —
    // sem gate de module_access, todo usuário logado vê.
    {
      label: 'Working',
      icon: <Kanban size={18} className={iconClass} />,
      items: [{ href: '/working/planejamento', label: 'Planejamento', icon: <Kanban size={18} className={iconClass} /> }],
    },
    // Pessoas primeiro: hub de dados compartilhados (usuário, cliente, e o que
    // vier depois) — vive dentro do próprio Cofre, sem gate de module_access.
    {
      label: 'Pessoas',
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
        ...(canManageLocaisGravacao(actor)
          ? [
              {
                href: '/cadastros/locais-gravacao', label: 'Locais de Gravação',
                icon: <MapPin size={18} className={iconClass} />,
              },
            ]
          : []),
      ],
    },
    ...(canManageProdutos(actor)
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
    ...(canManageAgenda(actor)
      ? [{ label: 'Agenda', icon: <CalendarDays size={18} className={iconClass} />, items: [{ href: '/agenda', label: 'Agenda', icon: <CalendarDays size={18} className={iconClass} /> }] }]
      : []),
    ...(canManageContratacoes(actor)
      ? [{
          label: 'Contratações',
          icon: <ShoppingCart size={18} className={iconClass} />,
          items: [{ href: '/contratacoes', label: 'Contratações', icon: <ShoppingCart size={18} className={iconClass} /> }],
        }]
      : []),
    ...(canManageOrdensServico(actor)
      ? [{
          label: 'Ordens de Serviço',
          icon: <ClipboardList size={18} className={iconClass} />,
          items: [{ href: '/ordens-servico', label: 'Ordens de Serviço', icon: <ClipboardList size={18} className={iconClass} /> }],
        }]
      : []),
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
