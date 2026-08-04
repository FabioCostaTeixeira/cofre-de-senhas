import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LayoutGrid, Lock as LockIcon, Users } from 'lucide-react';
import { SidebarShell, type SidebarGroup } from '@/components/SidebarShell';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const groups: SidebarGroup[] = [
  {
    label: 'Geral',
    items: [
      { href: '/', label: 'Salas', icon: LayoutGrid },
      { href: '/admin/salas', label: 'Salas (admin)', icon: Users },
      { href: '/admin/usuarios', label: 'Usuarios', icon: LockIcon },
    ],
  },
];

const logoutAction = async () => {};

function renderShell() {
  return render(
    <SidebarShell groups={groups} actorName="Fulano" logoutAction={logoutAction}>
      <div>conteudo</div>
    </SidebarShell>,
  );
}

describe('SidebarShell', () => {
  beforeEach(() => {
    mockPathname = '/';
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('C3: botao Sair tem nome acessivel quando colapsado', async () => {
    window.localStorage.setItem('sidebar-colapsado', '1');
    renderShell();
    const botoesSair = await screen.findAllByRole('button', { name: 'Sair' });
    expect(botoesSair.length).toBeGreaterThan(0);
  });

  it('C4: pathname /admin/salas marca "Salas (admin)" como ativo e "Salas" nao', () => {
    mockPathname = '/admin/salas';
    renderShell();
    const linksAdminSalas = screen.getAllByRole('link', { name: 'Salas (admin)' });
    const linksSalas = screen.getAllByRole('link', { name: 'Salas' });

    linksAdminSalas.forEach((link) => {
      expect(link).toHaveAttribute('aria-current', 'page');
    });
    linksSalas.forEach((link) => {
      expect(link).not.toHaveAttribute('aria-current');
    });
  });

  it('C4: pathname / marca somente o link raiz como ativo', () => {
    mockPathname = '/';
    renderShell();

    screen.getAllByRole('link', { name: 'Salas' }).forEach((link) => {
      expect(link).toHaveAttribute('aria-current', 'page');
    });
    screen.getAllByRole('link', { name: 'Salas (admin)' }).forEach((link) => {
      expect(link).not.toHaveAttribute('aria-current');
    });
    screen.getAllByRole('link', { name: 'Usuarios' }).forEach((link) => {
      expect(link).not.toHaveAttribute('aria-current');
    });
  });

  it('C4: pathname de sala especifica nao ativa nenhum link', () => {
    mockPathname = '/sala/11111111-1111-1111-1111-111111111111';
    renderShell();

    const todosOsLinks = [
      ...screen.getAllByRole('link', { name: 'Salas' }),
      ...screen.getAllByRole('link', { name: 'Salas (admin)' }),
      ...screen.getAllByRole('link', { name: 'Usuarios' }),
    ];

    todosOsLinks.forEach((link) => {
      expect(link).not.toHaveAttribute('aria-current');
    });
  });

  it('C5: alternarColapso grava no localStorage e a proxima montagem restaura o estado retraido', async () => {
    const { unmount } = renderShell();

    const botaoRetrair = screen.getByRole('button', { name: 'Retrair menu' });
    fireEvent.click(botaoRetrair);

    expect(window.localStorage.getItem('sidebar-colapsado')).toBe('1');

    unmount();
    renderShell();

    expect(await screen.findByRole('button', { name: 'Expandir menu' })).toBeInTheDocument();
  });
});
