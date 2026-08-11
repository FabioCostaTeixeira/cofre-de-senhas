'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgendaCard } from '@/components/AgendaCard';
import { AgendaFormularioModal, type AgendaFormState } from '@/components/AgendaFormularioModal';
import type { Agendamento, CategoriaProduto, LocalGravacao, Terceiro } from '@/lib/types';

const ALTURA_BLOCO_PX = 16; const BLOCOS_POR_DIA = 96;
const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
function minutos(hora: string) { const [h, m] = hora.slice(0, 5).split(':').map(Number); return h * 60 + m; }
function hora(min: number) { return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`; }
function somarDias(iso: string, dias: number) { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); }
type Acao = (prev: AgendaFormState, fd: FormData) => Promise<AgendaFormState>;
type Arrasto = { id: string; data: string; horaInicio: string; horaFim: string };

export function AgendaClient({ itens, clientes, locais, categorias, estudioId, inicioSemana, criar, salvar, apagar, mover }: {
  itens: Agendamento[]; clientes: Terceiro[]; locais: LocalGravacao[]; categorias: CategoriaProduto[]; estudioId: string; inicioSemana: string;
  criar: Acao; salvar: Acao; apagar: (id: string) => Promise<{ error?: string }>; mover: (id: string, data: string, horaInicio: string, horaFim: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter(); const [aberto, setAberto] = useState<Agendamento | 'novo' | null>(null); const [erro, setErro] = useState<string | null>(null); const [arrastando, setArrastando] = useState<Arrasto | null>(null); const gridRef = useRef<HTMLDivElement>(null);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i));
  const estudios = locais.flatMap((l) => l.estudios.map((e) => ({ id: e.id, rotulo: `${l.nome} — ${e.nome}` })));
  const itensDoDia = (dia: string) => itens.filter((i) => (arrastando?.id === i.id ? arrastando.data : i.data) === dia).map((i) => arrastando?.id === i.id ? { ...i, hora_inicio: arrastando.horaInicio, hora_fim: arrastando.horaFim } : i);
  function coordenadas(x: number, y: number) { const rect = gridRef.current?.getBoundingClientRect(); if (!rect) return null; const dia = Math.max(0, Math.min(6, Math.floor((x - rect.left) / (rect.width / 7)))); const bruto = ((y - rect.top) / ALTURA_BLOCO_PX) * 15; const m = Math.max(0, Math.min(BLOCOS_POR_DIA * 15 - 15, Math.round(bruto / 15) * 15)); return { dia, minutos: m }; }
  async function confirmar(m: Arrasto) { const r = await mover(m.id, m.data, m.horaInicio, m.horaFim); if (r.error) setErro(r.error); router.refresh(); }
  function iniciarMover(item: Agendamento) { return (e: React.PointerEvent) => { e.stopPropagation(); const duracao = minutos(item.hora_fim) - minutos(item.hora_inicio); function move(ev: PointerEvent) { const c = coordenadas(ev.clientX, ev.clientY); if (!c) return; const inicio = Math.min(c.minutos, BLOCOS_POR_DIA * 15 - duracao); setArrastando({ id: item.id, data: dias[c.dia], horaInicio: hora(inicio), horaFim: hora(inicio + duracao) }); } function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); setArrastando((a) => { if (a) void confirmar(a); return null; }); } document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); }; }
  function iniciarResize(item: Agendamento) { return (e: React.PointerEvent) => { e.stopPropagation(); function move(ev: PointerEvent) { const c = coordenadas(ev.clientX, ev.clientY); if (!c) return; const fim = Math.max(minutos(item.hora_inicio) + 15, c.minutos + 15); setArrastando({ id: item.id, data: item.data, horaInicio: item.hora_inicio, horaFim: hora(fim) }); } function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); setArrastando((a) => { if (a) void confirmar(a); return null; }); } document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); }; }
  const navegar = (id: string, semana: string) => router.push(`/agenda?estudioId=${id}&semana=${semana}`);
  return <div className="space-y-4">
    <div className="flex items-center gap-4 flex-wrap"><h1 className="text-xl font-semibold">Agenda</h1><select className="input" value={estudioId} onChange={(e) => navegar(e.target.value, inicioSemana)}>{estudios.map((e) => <option key={e.id} value={e.id}>{e.rotulo}</option>)}</select><button type="button" className="btn" onClick={() => navegar(estudioId, somarDias(inicioSemana, -7))}>◀ Semana</button><button type="button" className="btn" onClick={() => navegar(estudioId, somarDias(inicioSemana, 7))}>Semana ▶</button><button type="button" className="btn btn-primary" onClick={() => setAberto('novo')}>Novo agendamento</button></div>
    {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
    <div className="grid grid-cols-7 gap-1 text-xs text-center" style={{ color: 'var(--text-dim)' }}>{dias.map((d, i) => <div key={d}>{DIAS_SEMANA[i]} {d.slice(8, 10)}/{d.slice(5, 7)}</div>)}</div>
    <div className="grid grid-cols-7 gap-1" ref={gridRef} style={{ height: BLOCOS_POR_DIA * ALTURA_BLOCO_PX }}>{dias.map((d) => <div key={d} className="relative border" style={{ borderColor: 'var(--border)' }}>{itensDoDia(d).map((i) => <AgendaCard key={i.id} item={i} onPointerDownMover={iniciarMover(i)} onPointerDownRedimensionar={iniciarResize(i)} onClick={() => setAberto(i)} />)}</div>)}</div>
    {aberto && <AgendaFormularioModal item={aberto === 'novo' ? undefined : aberto} clientes={clientes} locais={locais} categorias={categorias} criar={criar} salvar={salvar} apagar={apagar} onFechar={() => setAberto(null)} />}
  </div>;
}
