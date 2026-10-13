import { describe, expect, it } from 'vitest';
import { MODULES } from '@/lib/modules';

describe('catálogo de módulos', () => {
  it('registra o módulo TI para menu e concessão de acesso', () => {
    expect(MODULES).toContainEqual(expect.objectContaining({
      key: 'ti',
      groupLabel: 'TI',
      label: 'Projetos de TI',
      href: '/ti',
    }));
  });
});
