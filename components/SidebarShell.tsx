'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Lock, LogOut, Menu, X } from 'lucide-react';

export type SidebarLink = { href: string; label: string; icon: React.ReactNode };
/**
 * `icon` é o que representa o grupo com a barra retraída, onde não cabe o texto
 * do cabeçalho. Sem ele todos os grupos viravam o mesmo símbolo e não dava para
 * saber qual era qual.
 */
export type SidebarGroup = { label: string; icon: React.ReactNode; items: SidebarLink[] };

const STORAGE_KEY = 'sidebar-colapsado';
const STORAGE_KEY_GRUPO = 'sidebar-grupo-aberto';

/** Rota atual bate com o item? `/` só casa exato, senão casaria com tudo. */
function itemAtivo(href: string, pathname: string): boolean {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroups({
  groups, colapsado, pathname, grupoAberto, onToggleGrupo, onNavigate,
}: {
  groups: SidebarGroup[];
  colapsado: boolean;
  pathname: string;
  grupoAberto: string | null;
  onToggleGrupo: (label: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-4">
      {groups.map((grupo) => {
        const aberto = grupoAberto === grupo.label;
        const idPainel = `grupo-${grupo.label.replace(/\s+/g, '-').toLowerCase()}`;
        return (
          <div key={grupo.label}>
            {/*
              Cabeçalho é botão nos dois estados. Retraído não cabe o texto, mas
              ele não pode virar enfeite: sem algo clicável aqui, os itens de um
              grupo fechado ficariam inalcançáveis sem expandir a barra antes.
            */}
            <button
              type="button"
              onClick={() => onToggleGrupo(grupo.label)}
              aria-expanded={aberto}
              aria-controls={idPainel}
              title={colapsado ? grupo.label : undefined}
              className="sidebar-grupo"
              style={{ justifyContent: colapsado ? 'center' : 'space-between' }}
            >
              {colapsado ? (
                grupo.icon
              ) : (
                <>
                  <span className="truncate">{grupo.label}</span>
                  <ChevronDown
                    size={14}
                    className="shrink-0 transition-transform"
                    style={{ transform: aberto ? undefined : 'rotate(-90deg)' }}
                  />
                </>
              )}
            </button>

            {aberto && (
              <div id={idPainel}>
                {grupo.items.map((item) => {
                  const ativo = itemAtivo(item.href, pathname);
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
            )}
          </div>
        );
      })}
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
    <div
      className={`space-y-2 border-t ${colapsado ? 'p-2' : 'p-3'}`}
      style={{ borderColor: 'var(--border)' }}
    >
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
          className={`btn w-full flex items-center justify-center gap-2 ${
            colapsado ? 'btn-icone' : ''
          }`}
          type="submit"
          aria-label="Sair"
        >
          <LogOut size={16} className="shrink-0" />
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

  // Grupo do menu aberto — só um por vez. `null` é válido: dá para fechar todos
  // clicando no cabeçalho. Começa no grupo da rota atual, para o item ativo nunca
  // nascer escondido.
  const grupoDaRota =
    groups.find((g) => g.items.some((i) => itemAtivo(i.href, pathname)))?.label ?? null;

  // Rota fora do menu (ex.: /sala/<id>) não casa com grupo nenhum, e sem um
  // padrão o sidebar abriria vazio. Cai no grupo que contém a raiz `/` — o do
  // próprio Cofre — em vez do primeiro da lista, que muda conforme a ordem
  // dos grupos e hoje seria "Módulos".
  const grupoPadrao =
    groups.find((g) => g.items.some((i) => i.href === '/'))?.label
    ?? groups[0]?.label
    ?? null;

  const [grupoAberto, setGrupoAberto] = useState<string | null>(grupoDaRota ?? grupoPadrao);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setColapsado(true);
  }, []);

  // Só restaura a escolha salva se ela não conflitar com a rota: aterrissar numa
  // página cujo grupo está fechado deixaria o menu sem nenhum item marcado.
  useEffect(() => {
    if (grupoDaRota) return;
    const salvo = localStorage.getItem(STORAGE_KEY_GRUPO);
    if (salvo !== null) setGrupoAberto(salvo === '' ? null : salvo);
  }, [grupoDaRota]);

  useEffect(() => {
    if (grupoDaRota) setGrupoAberto(grupoDaRota);
  }, [grupoDaRota]);

  useEffect(() => {
    setGavetaAberta(false);
  }, [pathname]);

  function alternarColapso() {
    const novo = !colapsado;
    setColapsado(novo);
    localStorage.setItem(STORAGE_KEY, novo ? '1' : '0');
  }

  function alternarGrupo(label: string) {
    const novo = grupoAberto === label ? null : label;
    setGrupoAberto(novo);
    localStorage.setItem(STORAGE_KEY_GRUPO, novo ?? '');
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        className={`glass hidden md:flex md:flex-col m-4 mr-0 shrink-0 md:sticky md:top-4 md:self-start md:h-[calc(100dvh-2rem)] transition-all duration-200 ${
          colapsado ? 'md:w-16' : 'md:w-60'
        }`}
      >
        <div className={`flex items-center gap-2 ${colapsado ? 'p-2 justify-center' : 'p-4'}`}>
          {!colapsado && <Image src="/brand/logo-sidebar.png" alt="4Nexus" width={120} height={40} className="h-8 w-auto flex-1 object-contain object-left" priority />}
          <button
            className={colapsado ? 'btn btn-icone' : 'btn'}
            onClick={alternarColapso}
            aria-label={colapsado ? 'Expandir menu' : 'Retrair menu'}
          >
            {colapsado ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <NavGroups
          groups={groups} colapsado={colapsado} pathname={pathname}
          grupoAberto={grupoAberto} onToggleGrupo={alternarGrupo}
        />
        <Rodape actorName={actorName} colapsado={colapsado} logoutAction={logoutAction} />
      </aside>

      <div className="glass fixed inset-x-4 top-4 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <Image src="/brand/logo-sidebar.png" alt="4Nexus" width={120} height={40} className="h-8 w-auto" priority />
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
          <Image src="/brand/logo-sidebar.png" alt="4Nexus" width={120} height={40} className="h-8 w-auto flex-1 object-contain object-left" priority />
          <button className="btn" onClick={() => setGavetaAberta(false)} aria-label="Fechar menu">
            <X size={16} />
          </button>
        </div>
        <NavGroups
          groups={groups} colapsado={false} pathname={pathname}
          grupoAberto={grupoAberto} onToggleGrupo={alternarGrupo}
          onNavigate={() => setGavetaAberta(false)}
        />
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
