import { describe, expect, it } from 'vitest';
import { distribuirEmColunas } from '@/lib/agenda-layout';

describe('distribuirEmColunas', () => {
  it('bloco sozinho ocupa a largura inteira', () => {
    const r = distribuirEmColunas([{ id: 'a', horaInicio: '09:00:00', horaFim: '10:00:00' }]);
    expect(r.get('a')).toEqual({ coluna: 0, total: 1 });
  });
  it('blocos que se sobrepõem ficam lado a lado', () => {
    const r = distribuirEmColunas([
      { id: 'a', horaInicio: '09:00', horaFim: '11:00' },
      { id: 'b', horaInicio: '10:00', horaFim: '12:00' },
    ]);
    expect(r.get('a')).toEqual({ coluna: 0, total: 2 });
    expect(r.get('b')).toEqual({ coluna: 1, total: 2 });
  });
  it('blocos encostados (um termina quando o outro começa) não dividem a largura', () => {
    const r = distribuirEmColunas([
      { id: 'a', horaInicio: '09:00', horaFim: '10:00' },
      { id: 'b', horaInicio: '10:00', horaFim: '11:00' },
    ]);
    expect(r.get('a')).toEqual({ coluna: 0, total: 1 });
    expect(r.get('b')).toEqual({ coluna: 0, total: 1 });
  });
  it('reaproveita a coluna livre dentro do grupo e separa grupos independentes', () => {
    const r = distribuirEmColunas([
      { id: 'a', horaInicio: '09:00', horaFim: '12:00' },
      { id: 'b', horaInicio: '09:00', horaFim: '10:00' },
      { id: 'c', horaInicio: '10:30', horaFim: '11:30' },
      { id: 'd', horaInicio: '14:00', horaFim: '15:00' },
    ]);
    expect(r.get('a')).toEqual({ coluna: 0, total: 2 });
    expect(r.get('b')).toEqual({ coluna: 1, total: 2 });
    expect(r.get('c')).toEqual({ coluna: 1, total: 2 });
    expect(r.get('d')).toEqual({ coluna: 0, total: 1 });
  });
  it('três ao mesmo tempo dividem em três', () => {
    const r = distribuirEmColunas(['a', 'b', 'c'].map((id) => ({ id, horaInicio: '09:00', horaFim: '10:00' })));
    expect(new Set(['a', 'b', 'c'].map((id) => r.get(id)!.coluna))).toEqual(new Set([0, 1, 2]));
    expect(r.get('a')!.total).toBe(3);
  });
});
