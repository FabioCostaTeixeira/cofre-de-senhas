import { describe, expect, it } from 'vitest';
import { MODULES, isModuleKey, rotaInicial } from '@/lib/modules';

describe('catálogo de áreas', () => {
  it('registra cada área liberável com sua rota de entrada', () => {
    expect(MODULES.map((m) => [m.key, m.href])).toEqual([
      ['painel', '/'],
      ['working', '/working/planejamento'],
      ['agenda', '/agenda'],
      ['clientes', '/cadastros/clientes'],
      ['fornecedores', '/cadastros/fornecedores'],
      ['locais_gravacao', '/cadastros/locais-gravacao'],
      ['produtos', '/produtos'],
      ['contratacoes', '/contratacoes'],
      ['ordens_servico', '/ordens-servico'],
      ['ti', '/ti'],
    ]);
  });

  it('não expõe administração nem a Gestão de Projetos desativada', () => {
    for (const k of ['admin', 'usuarios', 'auditoria', 'lixeira', 'senhas', 'gestao']) {
      expect(isModuleKey(k)).toBe(false);
    }
  });
});

describe('rotaInicial', () => {
  it('leva para a primeira área liberada, na ordem do catálogo', () => {
    expect(rotaInicial(['ti', 'agenda'])).toBe('/agenda');
  });

  it('ignora o próprio Painel (é dele que se está saindo)', () => {
    expect(rotaInicial(['painel', 'clientes'])).toBe('/cadastros/clientes');
  });

  it('sem nenhuma área, cai em "Meus dados"', () => {
    expect(rotaInicial([])).toBe('/usuarios');
    expect(rotaInicial(['gestao'])).toBe('/usuarios');
  });
});
