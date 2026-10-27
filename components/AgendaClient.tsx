'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALTURA_BLOCO_PX, AgendaCard, calcularPosicaoCard } from '@/components/AgendaCard';
import { AgendaFormularioModal, type AgendaFormState } from '@/components/AgendaFormularioModal';
import { AgendaLista, calcularMesesDisponiveis, mesRotulo } from '@/components/AgendaLista';
import { BloqueioFormularioModal } from '@/components/BloqueioFormularioModal';
import { AGENDA_BLOCO_MIN, AGENDA_FIM_MIN, AGENDA_INICIO_MIN } from '@/lib/agenda-form';
import type { Agendamento, BloqueioEstudio, CategoriaProduto, LocalGravacao, Terceiro } from '@/lib/types';

const BLOCOS_POR_DIA = (AGENDA_FIM_MIN - AGENDA_INICIO_MIN) / AGENDA_BLOCO_MIN;
const BLOCOS_POR_HORA = 60 / AGENDA_BLOCO_MIN;
const LIMIAR_ARRASTO_PX = 4;
const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function minutos(hora: string) {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function hora(min: number) {
  return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function segundaDaSemana(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  return d.toISOString().slice(0, 10);
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function minutosAgora() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function janelaPadrao(inicioMin: number) {
  const fim = Math.min(inicioMin + 60, AGENDA_FIM_MIN);
  const inicio = Math.max(AGENDA_INICIO_MIN, Math.min(inicioMin, fim - AGENDA_BLOCO_MIN));
  return { horaInicio: hora(inicio), horaFim: hora(fim) };
}

type Acao = (prev: AgendaFormState, fd: FormData) => Promise<AgendaFormState>;
type Arrasto = { id: string; data: string; horaInicio: string; horaFim: string };
type Rascunho = { data: string; horaInicio: string; horaFim: string; localId: string; estudioId: string };

export function AgendaClient({
  itens, itensDoEstudio, bloqueiosDaSemana, bloqueiosAtivos, bloqueiosDoEstudio, clientes, locais, categorias, estudioId, inicioSemana,
  criar, salvar, apagar, mover, criarBloqueio, apagarBloqueio,
}: {
  itens: Agendamento[]; itensDoEstudio: Agendamento[];
  bloqueiosDaSemana: BloqueioEstudio[]; bloqueiosAtivos: BloqueioEstudio[]; bloqueiosDoEstudio: BloqueioEstudio[];
  clientes: Terceiro[]; locais: LocalGravacao[]; categorias: CategoriaProduto[]; estudioId: string; inicioSemana: string;
  criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>;
  mover: (id: string, data: string, horaInicio: string, horaFim: string) => Promise<{ error?: string }>;
  criarBloqueio: Acao; apagarBloqueio: (id: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Agendamento | Rascunho | 'novo' | null>(null);
  const [bloqueioAberto, setBloqueioAberto] = useState(false);
  const [modoLista, setModoLista] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [mesFiltro, setMesFiltro] = useState('todos');
  const [bloqueioSelecionado, setBloqueioSelecionado] = useState<BloqueioEstudio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<Arrasto | null>(null);
  const [dataAlvo, setDataAlvo] = useState('');
  const [agora, setAgora] = useState(() => minutosAgora());
  const gridRef = useRef<HTMLDivElement>(null);
  const suprimirProximoCliqueRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setAgora(minutosAgora()), 30000);
    return () => clearInterval(id);
  }, []);

  // Foca a grade na hora atual ao carregar, para não abrir sempre em 00:00 e
  // obrigar a rolar manualmente até o horário do dia.
  useEffect(() => {
    const horaAtual = String(new Date().getHours()).padStart(2, '0');
    const elemento = document.getElementById(`agenda-hora-${horaAtual}`);
    if (elemento && typeof elemento.scrollIntoView === 'function') {
      elemento.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, []);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i));
  const hoje = hojeISO();
  const locaisComEstudio = locais.filter((local) => local.estudios.length > 0);
  const localAtual = locaisComEstudio.find((local) => local.estudios.some((estudio) => estudio.id === estudioId))
    ?? locaisComEstudio[0];

  const itensDoDia = (dia: string) => itens
    .filter((item) => (arrastando?.id === item.id ? arrastando.data : item.data) === dia)
    .map((item) => arrastando?.id === item.id
      ? { ...item, hora_inicio: arrastando.horaInicio, hora_fim: arrastando.horaFim }
      : item);

  const bloqueiosDoDia = (dia: string) => bloqueiosDaSemana.filter((b) => b.data === dia);

  const mesesDisponiveis = calcularMesesDisponiveis([
    ...itensDoEstudio.map((i) => i.data),
    ...bloqueiosDoEstudio.map((b) => b.data),
  ]);

  function coordenadas(x: number, y: number) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const dia = Math.max(0, Math.min(6, Math.floor((x - rect.left) / (rect.width / 7))));
    const bruto = AGENDA_INICIO_MIN + ((y - rect.top) / ALTURA_BLOCO_PX) * AGENDA_BLOCO_MIN;
    const m = Math.max(
      AGENDA_INICIO_MIN,
      Math.min(AGENDA_FIM_MIN - AGENDA_BLOCO_MIN, Math.round(bruto / AGENDA_BLOCO_MIN) * AGENDA_BLOCO_MIN),
    );
    return { dia, minutos: m };
  }

  async function confirmar(m: Arrasto) {
    const r = await mover(m.id, m.data, m.horaInicio, m.horaFim);
    if (r.error) setErro(r.error);
    router.refresh();
  }

  function suprimirCliqueFantasma() {
    suprimirProximoCliqueRef.current = true;
    setTimeout(() => {
      suprimirProximoCliqueRef.current = false;
    }, 0);
  }

  function iniciarMover(item: Agendamento) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      const origem = { x: e.clientX, y: e.clientY };
      const duracao = minutos(item.hora_fim) - minutos(item.hora_inicio);
      let houveMovimento = false;
      let ultimo: Arrasto | null = null;

      function move(ev: PointerEvent) {
        if (!houveMovimento && Math.hypot(ev.clientX - origem.x, ev.clientY - origem.y) < LIMIAR_ARRASTO_PX) return;
        houveMovimento = true;
        const c = coordenadas(ev.clientX, ev.clientY);
        if (!c) return;
        const inicio = Math.max(AGENDA_INICIO_MIN, Math.min(c.minutos, AGENDA_FIM_MIN - duracao));
        ultimo = { id: item.id, data: dias[c.dia], horaInicio: hora(inicio), horaFim: hora(inicio + duracao) };
        setArrastando(ultimo);
      }

      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!houveMovimento) return;
        suprimirCliqueFantasma();
        setArrastando(null);
        if (ultimo) void confirmar(ultimo);
      }

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };
  }

  function iniciarResize(item: Agendamento) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      const origem = { x: e.clientX, y: e.clientY };
      let houveMovimento = false;
      let ultimo: Arrasto | null = null;

      function move(ev: PointerEvent) {
        if (!houveMovimento && Math.hypot(ev.clientX - origem.x, ev.clientY - origem.y) < LIMIAR_ARRASTO_PX) return;
        houveMovimento = true;
        const c = coordenadas(ev.clientX, ev.clientY);
        if (!c) return;
        const fim = Math.max(minutos(item.hora_inicio) + AGENDA_BLOCO_MIN, c.minutos + AGENDA_BLOCO_MIN);
        ultimo = { id: item.id, data: item.data, horaInicio: hora(minutos(item.hora_inicio)), horaFim: hora(fim) };
        setArrastando(ultimo);
      }

      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!houveMovimento) return;
        suprimirCliqueFantasma();
        setArrastando(null);
        if (ultimo) void confirmar(ultimo);
      }

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };
  }

  const navegar = (id: string, semana: string) => router.push(`/agenda?estudioId=${id}&semana=${semana}`);
  const abrirEdicao = (item: Agendamento) => {
    if (suprimirProximoCliqueRef.current) {
      suprimirProximoCliqueRef.current = false;
      return;
    }
    setAberto(item);
  };
  const abrirCriacaoNaCelula = (dia: string, bloco: number) => {
    if (suprimirProximoCliqueRef.current) {
      suprimirProximoCliqueRef.current = false;
      return;
    }
    const { horaInicio, horaFim } = janelaPadrao(AGENDA_INICIO_MIN + bloco * AGENDA_BLOCO_MIN);
    setAberto({ data: dia, horaInicio, horaFim, localId: localAtual?.id ?? '', estudioId });
  };

  return <div className="space-y-4">
    <div className="flex items-end justify-center gap-4 flex-wrap">
      <h1 className="text-xl font-semibold self-center">Agenda</h1>
      <label className="block space-y-1">
        <span className="text-sm">Local de gravação</span>
        <select
          aria-label="Local de gravação"
          className="input"
          value={localAtual?.id ?? ''}
          onChange={(e) => {
            const primeiroEstudio = locaisComEstudio.find((local) => local.id === e.target.value)?.estudios[0];
            if (primeiroEstudio) navegar(primeiroEstudio.id, inicioSemana);
          }}
        >
          {locaisComEstudio.map((local) => <option key={local.id} value={local.id}>{local.nome}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Estúdio</span>
        <select aria-label="Estúdio" className="input" value={estudioId} onChange={(e) => navegar(e.target.value, inicioSemana)}>
          {(localAtual?.estudios ?? []).map((estudio) => <option key={estudio.id} value={estudio.id}>{estudio.nome}</option>)}
        </select>
      </label>
      {!modoLista && (
        <>
          <button type="button" className="btn" onClick={() => navegar(estudioId, somarDias(inicioSemana, -7))}>◀ Semana</button>
          <button type="button" className="btn" onClick={() => navegar(estudioId, somarDias(inicioSemana, 7))}>Semana ▶</button>
          <button type="button" className="btn" onClick={() => navegar(estudioId, segundaDaSemana(hojeISO()))}>Hoje</button>
          <label className="block space-y-1">
            <span className="text-sm">Ir para</span>
            <div className="flex gap-2">
              <input
                type="date"
                aria-label="Data para navegar"
                className="input"
                style={{ width: 'auto' }}
                value={dataAlvo}
                onChange={(e) => setDataAlvo(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={!dataAlvo}
                onClick={() => navegar(estudioId, segundaDaSemana(dataAlvo))}
              >
                Ir para
              </button>
            </div>
          </label>
        </>
      )}
      {modoLista && (
        <>
          <label className="block space-y-1">
            <span className="text-sm">Buscar cliente</span>
            <input
              type="text"
              aria-label="Buscar cliente"
              className="input"
              style={{ width: 'auto' }}
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Nome do cliente"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Mês</span>
            <select aria-label="Filtrar por mês" className="input" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)}>
              <option value="todos">Todos os meses</option>
              {mesesDisponiveis.map((m) => <option key={m} value={m}>{mesRotulo(m)}</option>)}
            </select>
          </label>
        </>
      )}
      <button type="button" className="btn btn-primary" onClick={() => setAberto('novo')}>Novo agendamento</button>
      <button type="button" className="btn" onClick={() => setBloqueioAberto(true)}>Bloquear horário</button>
      <button type="button" className="btn" onClick={() => setModoLista((atual) => !atual)}>{modoLista ? 'Ver grade' : 'Ver lista'}</button>
    </div>
    {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    {modoLista && (
      <AgendaLista
        agendamentos={itensDoEstudio}
        bloqueios={bloqueiosDoEstudio}
        mesesDisponiveis={mesesDisponiveis}
        busca={buscaCliente}
        mesFiltro={mesFiltro}
      />
    )}
    {!modoLista && <>
    <div className="grid gap-1 text-xs text-center" style={{ gridTemplateColumns: '3rem repeat(7, minmax(0, 1fr))', color: 'var(--text-dim)' }}>
      <div aria-hidden="true" />
      {dias.map((d, i) => <div key={d} style={d === hoje ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{DIAS_SEMANA[i]} {d.slice(8, 10)}/{d.slice(5, 7)}</div>)}
    </div>
    <div data-testid="agenda-scroll" className="max-h-[70vh] overflow-y-auto" onClick={() => setBloqueioSelecionado(null)}>
      <div className="relative grid gap-1" style={{ gridTemplateColumns: '3rem minmax(0, 1fr)' }}>
        {agora >= AGENDA_INICIO_MIN && agora <= AGENDA_FIM_MIN && <div
          data-testid="agenda-linha-agora"
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: ((agora - AGENDA_INICIO_MIN) / AGENDA_BLOCO_MIN) * ALTURA_BLOCO_PX, height: 2, backgroundColor: 'var(--danger)', zIndex: 10 }}
        />}
        <div aria-hidden="true" style={{ height: BLOCOS_POR_DIA * ALTURA_BLOCO_PX }}>
          {Array.from({ length: BLOCOS_POR_DIA }, (_, bloco) => {
            const inicioBloco = AGENDA_INICIO_MIN + bloco * AGENDA_BLOCO_MIN;
            const cheia = bloco % BLOCOS_POR_HORA === 0;
            return <div
              key={bloco}
              id={cheia ? `agenda-hora-${hora(inicioBloco).slice(0, 2)}` : undefined}
              className="text-base leading-none text-right pr-1"
              style={{ height: ALTURA_BLOCO_PX, color: 'var(--text-dim)' }}
            >{cheia ? hora(inicioBloco) : ''}</div>;
          })}
        </div>
        <div ref={gridRef} className="grid grid-cols-7 gap-1" style={{ height: BLOCOS_POR_DIA * ALTURA_BLOCO_PX }}>
          {dias.map((dia) => <div
            key={dia}
            className="relative border-x"
            data-testid="agenda-coluna-dia"
            style={{ borderColor: 'var(--border)', backgroundColor: dia === hoje ? 'rgba(255, 148, 0, 0.06)' : undefined }}
          >
            {Array.from({ length: BLOCOS_POR_DIA }, (_, bloco) => <div
              key={bloco}
              data-testid="agenda-slot"
              onClick={() => abrirCriacaoNaCelula(dia, bloco)}
              style={{ height: ALTURA_BLOCO_PX, borderTop: '1px solid var(--border)', cursor: 'pointer' }}
            />)}
            {bloqueiosDoDia(dia).map((b) => {
              const { top, height } = calcularPosicaoCard(b.hora_inicio, b.hora_fim);
              return <div
                key={b.id}
                data-testid="agenda-bloqueio"
                title={b.motivo ?? 'Bloqueado'}
                className="absolute left-1 right-1 rounded cursor-pointer"
                style={{ top, height, backgroundColor: '#fff', zIndex: 5 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setBloqueioSelecionado((atual) => (atual?.id === b.id ? null : b));
                }}
              >
                {bloqueioSelecionado?.id === b.id && (
                  <div
                    data-testid="agenda-bloqueio-tooltip"
                    className="absolute left-0 top-full mt-1 rounded p-2 text-xs whitespace-nowrap"
                    style={{ backgroundColor: 'var(--bg, #1e212d)', border: '1px solid var(--border)', color: 'var(--text)', zIndex: 20 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="font-medium">{b.hora_inicio.slice(0, 5)}–{b.hora_fim.slice(0, 5)}</div>
                    <div>{b.motivo || 'Bloqueado'}</div>
                  </div>
                )}
              </div>;
            })}
            {itensDoDia(dia).map((item) => <AgendaCard
              key={item.id}
              item={item}
              onPointerDownMover={iniciarMover(item)}
              onPointerDownRedimensionar={iniciarResize(item)}
              onClick={() => abrirEdicao(item)}
            />)}
          </div>)}
        </div>
      </div>
    </div>
    </>}
    {aberto && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setAberto(null); }}
      >
        <div className="w-full max-w-2xl">
          <AgendaFormularioModal
            item={aberto !== 'novo' && aberto && 'id' in aberto ? aberto : undefined}
            padraoData={aberto !== 'novo' && aberto && !('id' in aberto) ? aberto.data : undefined}
            padraoHoraInicio={aberto !== 'novo' && aberto && !('id' in aberto) ? aberto.horaInicio : undefined}
            padraoHoraFim={aberto !== 'novo' && aberto && !('id' in aberto) ? aberto.horaFim : undefined}
            padraoLocalId={aberto !== 'novo' && aberto && !('id' in aberto) ? aberto.localId : undefined}
            padraoEstudioId={aberto !== 'novo' && aberto && !('id' in aberto) ? aberto.estudioId : undefined}
            clientes={clientes} locais={locais} categorias={categorias} criar={criar} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)}
          />
        </div>
      </div>
    )}
    {bloqueioAberto && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setBloqueioAberto(false); }}
      >
        <div className="w-full max-w-2xl">
          <BloqueioFormularioModal
            estudioId={estudioId}
            bloqueios={bloqueiosAtivos}
            criar={criarBloqueio}
            apagar={apagarBloqueio}
            onFechar={() => setBloqueioAberto(false)}
            onAtualizar={() => router.refresh()}
          />
        </div>
      </div>
    )}
  </div>;
}
