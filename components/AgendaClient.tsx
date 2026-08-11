'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgendaCard } from '@/components/AgendaCard';
import { AgendaFormularioModal, type AgendaFormState } from '@/components/AgendaFormularioModal';
import type { Agendamento, CategoriaProduto, LocalGravacao, Terceiro } from '@/lib/types';

const ALTURA_BLOCO_PX = 25;
const BLOCOS_POR_DIA = 96;
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
  const fim = Math.min(inicioMin + 60, BLOCOS_POR_DIA * 15 - 15);
  const inicio = Math.max(0, Math.min(inicioMin, fim - 15));
  return { horaInicio: hora(inicio), horaFim: hora(fim) };
}

type Acao = (prev: AgendaFormState, fd: FormData) => Promise<AgendaFormState>;
type Arrasto = { id: string; data: string; horaInicio: string; horaFim: string };
type Rascunho = { data: string; horaInicio: string; horaFim: string };

export function AgendaClient({ itens, clientes, locais, categorias, estudioId, inicioSemana, criar, salvar, apagar, mover }: {
  itens: Agendamento[]; clientes: Terceiro[]; locais: LocalGravacao[]; categorias: CategoriaProduto[]; estudioId: string; inicioSemana: string;
  criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; mover: (id: string, data: string, horaInicio: string, horaFim: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Agendamento | Rascunho | 'novo' | null>(null);
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

  function coordenadas(x: number, y: number) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const dia = Math.max(0, Math.min(6, Math.floor((x - rect.left) / (rect.width / 7))));
    const bruto = ((y - rect.top) / ALTURA_BLOCO_PX) * 15;
    const m = Math.max(0, Math.min(BLOCOS_POR_DIA * 15 - 15, Math.round(bruto / 15) * 15));
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
        const inicio = Math.min(c.minutos, BLOCOS_POR_DIA * 15 - duracao);
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
        const fim = Math.max(minutos(item.hora_inicio) + 15, c.minutos + 15);
        ultimo = { id: item.id, data: item.data, horaInicio: item.hora_inicio, horaFim: hora(fim) };
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
    const { horaInicio, horaFim } = janelaPadrao(bloco * 15);
    setAberto({ data: dia, horaInicio, horaFim });
  };

  return <div className="space-y-4">
    <div className="flex items-end gap-4 flex-wrap">
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
      <button type="button" className="btn btn-primary" onClick={() => setAberto('novo')}>Novo agendamento</button>
    </div>
    {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    <div className="grid gap-1 text-xs text-center" style={{ gridTemplateColumns: '3rem repeat(7, minmax(0, 1fr))', color: 'var(--text-dim)' }}>
      <div aria-hidden="true" />
      {dias.map((d, i) => <div key={d} style={d === hoje ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{DIAS_SEMANA[i]} {d.slice(8, 10)}/{d.slice(5, 7)}</div>)}
    </div>
    <div data-testid="agenda-scroll" className="max-h-[70vh] overflow-y-auto">
      <div className="relative grid gap-1" style={{ gridTemplateColumns: '3rem minmax(0, 1fr)' }}>
        <div
          data-testid="agenda-linha-agora"
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: (agora / 15) * ALTURA_BLOCO_PX, height: 2, backgroundColor: 'var(--danger)', zIndex: 10 }}
        />
        <div aria-hidden="true" style={{ height: BLOCOS_POR_DIA * ALTURA_BLOCO_PX }}>
          {Array.from({ length: BLOCOS_POR_DIA }, (_, bloco) => <div key={bloco} className="text-[10px] leading-none text-right pr-1" style={{ height: ALTURA_BLOCO_PX, color: 'var(--text-dim)' }}>{bloco % 4 === 0 ? hora(bloco * 15) : ''}</div>)}
        </div>
        <div ref={gridRef} className="grid grid-cols-7 gap-1" style={{ height: BLOCOS_POR_DIA * ALTURA_BLOCO_PX }}>
          {dias.map((dia) => <div
            key={dia}
            className="relative border-x"
            data-testid="agenda-coluna-dia"
            style={{ borderColor: 'var(--border)', backgroundColor: dia === hoje ? 'rgba(108, 140, 255, 0.06)' : undefined }}
          >
            {Array.from({ length: BLOCOS_POR_DIA }, (_, bloco) => <div
              key={bloco}
              data-testid="agenda-slot"
              onClick={() => abrirCriacaoNaCelula(dia, bloco)}
              style={{ height: ALTURA_BLOCO_PX, borderTop: '1px solid var(--border)', cursor: 'pointer' }}
            />)}
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
            clientes={clientes} locais={locais} categorias={categorias} criar={criar} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)}
          />
        </div>
      </div>
    )}
  </div>;
}
