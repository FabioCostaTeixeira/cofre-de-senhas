import type { DadosLocal } from '@/lib/types';

export function lerEstudios(json: string): DadosLocal['estudios'] | { error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return { error: 'Lista de estúdios inválida.' };
  }
  if (!Array.isArray(bruto)) return { error: 'Lista de estúdios inválida.' };

  const estudios: DadosLocal['estudios'] = [];
  for (const item of bruto) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).nome !== 'string'
    ) {
      return { error: 'Lista de estúdios inválida.' };
    }
    const { id, nome } = item as { id?: unknown; nome: string };
    if (id !== undefined && typeof id !== 'string') return { error: 'Lista de estúdios inválida.' };

    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return { error: 'Todo estúdio precisa de um nome.' };

    estudios.push(id ? { id, nome: nomeNormalizado } : { nome: nomeNormalizado });
  }
  return estudios;
}

/** `''` vira `null`: campo em branco é ausência de dado, não string vazia no banco. */
function ouNulo(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim();
  return v === '' ? null : v;
}

export function lerDadosLocal(fd: FormData): DadosLocal | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const estudios = lerEstudios(String(fd.get('estudios') ?? '[]'));
  if ('error' in estudios) return estudios;

  return {
    nome, endereco: ouNulo(fd, 'endereco'), responsavel: ouNulo(fd, 'responsavel'), estudios,
  };
}
