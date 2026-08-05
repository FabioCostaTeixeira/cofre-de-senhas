'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Lock, LogOut, Menu, X } from 'lucide-react';

export type SidebarLink = { href: string; label: string; icon: React.ReactNode };
export type SidebarGroup = { label: string; items: SidebarLink[] };

const STORAGE_KEY = 'sidebar-colapsado';

function NavGroups({
  groups, colapsado, pathname, onNavigate,
}: {
  groups: SidebarGroup[];
  colapsado: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-4">
      {groups.map((grupo) => (
        <div key={grupo.label}>
          {!colapsado && (
            <p
              className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-dim)' }}
            >
              {grupo.label}
            </p>
          )}
          {grupo.items.map((item) => {
            const ativo = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={onNavigate}
                className={ativo ? 'sidebar-link sidebar-link-ativo' : 'sidebar-link'}
                aria-current={ativo ? 'page' : undefined}
                style={{ justifyContent: colapsado ? 'center' : 'flex-start' }}
              >
                {item.icon}
                {!colapsado && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Rodape({
  actorName, colapsado, logoutAction, onNavigate,
}: {
  actorName: string;
  colapsado: boolean;
  logoutAction: (formData: FormData) => Promise<void>;
  onNavigate?: () => void;
}) {
  return (
    <div className="p-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
      {!colapsado && (
        <p className="px-1 text-sm truncate" style={{ color: 'var(--text-dim)' }}>{actorName}</p>
      )}
      <Link
        href="/trocar-senha"
        title="Trocar senha"
        onClick={onNavigate}
        className="sidebar-link"
        style={{ justifyContent: colapsado ? 'center' : 'flex-start' }}
      >
        <Lock size={18} className="shrink-0" />
        {!colapsado && <span>Trocar senha</span>}
      </Link>
      <form action={logoutAction}>
        <button
          className="btn w-full flex items-center justify-center gap-2"
          type="submit"
          aria-label="Sair"
        >
          <LogOut size={16} />
          {!colapsado && <span>Sair</span>}
        </button>
      </form>
    </div>
  );
}

export function SidebarShell({
  groups, actorName, logoutAction, children,
}: {
  groups: SidebarGroup[];
  actorName: string;
  logoutAction: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [colapsado, setColapsado] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setColapsado(true);
  }, []);

  useEffect(() => {
    setGavetaAberta(false);
  }, [pathname]);

  function alternarColapso() {
    const novo = !colapsado;
    setColapsado(novo);
    localStorage.setItem(STORAGE_KEY, novo ? '1' : '0');
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`glass hidden md:flex md:flex-col m-4 mr-0 shrink-0 md:sticky md:top-4 md:self-start md:h-[calc(100dvh-2rem)] transition-all duration-200 ${
          colapsado ? 'md:w-16' : 'md:w-60'
        }`}
      >
        <div className="flex items-center gap-2 p-4">
          {!colapsado && <span className="font-semibold flex-1 truncate">4NEXUS</span>}
          <button
            className="btn"
            onClick={alternarColapso}
            aria-label={colapsado ? 'Expandir menu' : 'Retrair menu'}
          >
            {colapsado ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <NavGroups groups={groups} colapsado={colapsado} pathname={pathname} />
        <Rodape actorName={actorName} colapsado={colapsado} logoutAction={logoutAction} />
      </aside>

      <div className="glass fixed inset-x-4 top-4 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <span className="font-semibold">4NEXUS</span>
        <button className="btn" onClick={() => setGavetaAberta(true)} aria-label="Abrir menu">
          <Menu size={18} />
        </button>
      </div>

      {gavetaAberta && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setGavetaAberta(false)}
        />
      )}

      <aside
        inert={!gavetaAberta}
        className={`glass fixed inset-y-4 left-4 z-50 flex w-60 flex-col transition-transform duration-200 md:hidden ${
          gavetaAberta ? 'translate-x-0' : '-translate-x-[120%]'
        }`}
      >
        <div className="flex items-center gap-2 p-4">
          <span className="font-semibold flex-1 truncate">4NEXUS</span>
          <button className="btn" onClick={() => setGavetaAberta(false)} aria-label="Fechar menu">
            <X size={16} />
          </button>
        </div>
        <NavGroups groups={groups} colapsado={false} pathname={pathname} onNavigate={() => setGavetaAberta(false)} />
        <Rodape
          actorName={actorName} colapsado={false} logoutAction={logoutAction}
          onNavigate={() => setGavetaAberta(false)}
        />
      </aside>

      <div className="flex-1 min-w-0 pt-20 md:pt-0">
        {children}
      </div>
    </div>
  );
}
