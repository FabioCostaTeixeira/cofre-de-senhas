'use client';

import type { ModuleDef } from '@/lib/modules';

/**
 * Escolha das áreas (`lib/modules.ts`) a que um usuário tem acesso. Mesmo padrão de
 * `SeletorSalas`: caixas controladas, porque o conjunto muda sozinho ao trocar o
 * papel para master (que já enxerga todos os módulos).
 */
export function SeletorModulos({
  modulos, selecionados, onChange, desabilitado = false, dica,
}: {
  modulos: ModuleDef[];
  selecionados: string[];
  onChange: (keys: string[]) => void;
  desabilitado?: boolean;
  dica?: string;
}) {
  function alternar(key: string, marcada: boolean) {
    onChange(marcada ? [...selecionados, key] : selecionados.filter((k) => k !== key));
  }

  if (modulos.length === 0) return null;

  return (
    <div className="space-y-2">
      {selecionados.map((key) => (
        <input key={key} type="hidden" name="modulos" value={key} />
      ))}

      <span className="text-sm">Áreas com acesso</span>
      {dica && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{dica}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-2" style={{ opacity: desabilitado ? 0.55 : 1 }}>
        {modulos.map((m) => (
          <label key={m.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selecionados.includes(m.key)}
              disabled={desabilitado}
              onChange={(e) => alternar(m.key, e.target.checked)}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}
