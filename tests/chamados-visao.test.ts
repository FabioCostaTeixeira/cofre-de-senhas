import { describe, expect, it } from 'vitest';
import { resolverVisaoChamados } from '@/lib/chamados-visao';

const master = { id: 'm', role: 'master' as const };
const gestor = { id: 'g', role: 'gestor' as const };
const user = { id: 'u', role: 'user' as const };

describe('resolverVisaoChamados', () => {
  it('master/gestor na Geral: todos os chamados, sem filtro pessoal', () => {
    for (const a of [master, gestor]) {
      expect(resolverVisaoChamados(a, {})).toEqual({ temAbas: true, individual: false, filtro: null, consulta: {} });
      // filtro na URL é ignorado na Geral
      expect(resolverVisaoChamados(a, { filtro: 'abertos' }).consulta).toEqual({});
    }
  });

  it('Individual abre em "Designados a mim" e aceita os outros filtros', () => {
    expect(resolverVisaoChamados(gestor, { visao: 'individual' })).toMatchObject({
      individual: true, filtro: 'designados', consulta: { responsavel: 'g' },
    });
    expect(resolverVisaoChamados(gestor, { visao: 'individual', filtro: 'abertos' }).consulta).toEqual({ criadoPor: 'g' });
    expect(resolverVisaoChamados(master, { visao: 'individual', filtro: 'todos' }).consulta).toEqual({ envolvido: 'm' });
  });

  it('usuário comum abre em "Todos" (abertos + designados), sem abas', () => {
    expect(resolverVisaoChamados(user, {})).toEqual({
      temAbas: false, individual: false, filtro: 'todos', consulta: { envolvido: 'u' },
    });
    expect(resolverVisaoChamados(user, { filtro: 'abertos' }).consulta).toEqual({ criadoPor: 'u' });
    expect(resolverVisaoChamados(user, { filtro: 'designados' }).consulta).toEqual({ responsavel: 'u' });
  });

  it('usuário comum não chega à visão geral pela URL', () => {
    expect(resolverVisaoChamados(user, { visao: 'individual', filtro: 'xyz' })).toMatchObject({
      temAbas: false, individual: false, filtro: 'todos', consulta: { envolvido: 'u' },
    });
  });
});
