'use client';

import { useState } from 'react';
import type { ItemEntrada, TipoItemPedido } from '@/lib/types';

export type OpcaoItem = { tipo: TipoItemPedido; valor: string; rotulo: string; preco: number };

export function calcularSomaItens(itens: ItemEntrada[], opcoes: OpcaoItem[]): number {
  return itens.reduce((acc, item) => {
    const opcao = opcoes.find((o) => o.tipo === item.tipo && o.valor === item.valor);
    return acc + (opcao?.preco ?? 0) * item.quantidade;
  }, 0);
}

export function ItemRepetidor({
  nomeCampo, opcoes, itens, onChange,
}: { nomeCampo: string; opcoes: OpcaoItem[]; itens: ItemEntrada[]; onChange: (itens: ItemEntrada[]) => void }) {
  const [opcaoEscolhida, setOpcaoEscolhida] = useState(opcoes[0] ? `${opcoes[0].tipo}:${opcoes[0].valor}` : '');
  const [quantidade, setQuantidade] = useState(1);

  function adicionar() {
    if (!opcaoEscolhida || quantidade <= 0) return;
    const [tipo, valor] = opcaoEscolhida.split(':') as [TipoItemPedido, string];
    onChange([...itens, { tipo, valor, quantidade }]);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={nomeCampo} value={JSON.stringify(itens)} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1 flex-1 min-w-[12rem]">
          <span className="text-sm">Item</span>
          <select className="input" value={opcaoEscolhida} onChange={(e) => setOpcaoEscolhida(e.target.value)}>
            {opcoes.map((o) => (
              <option key={`${o.tipo}:${o.valor}`} value={`${o.tipo}:${o.valor}`}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 w-24">
          <span className="text-sm">Qtd.</span>
          <input type="number" min={1} className="input" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
        </label>
        <button type="button" className="btn" onClick={adicionar}>Adicionar</button>
      </div>
      <ul className="text-sm space-y-1">
        {itens.map((item, i) => {
          const opcao = opcoes.find((o) => o.tipo === item.tipo && o.valor === item.valor);
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="flex-1">{item.quantidade}x {opcao?.rotulo ?? item.valor}</span>
              <button type="button" className="btn" onClick={() => onChange(itens.filter((_, idx) => idx !== i))}>
                Remover
              </button>
            </li>
          );
        })}
      </ul>
      {itens.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhum item adicionado.</p>}
    </div>
  );
}
