import { soDigitos } from '@/lib/documentos';
import type { DadosTerceiro } from '@/lib/types';

/** `''` vira `null`: campo em branco é ausência de dado, não string vazia no banco. */
function ouNulo(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim();
  return v === '' ? null : v;
}

const UF_RE = /^[A-Z]{2}$/;

/**
 * Lê e valida os campos editáveis do formulário de cliente/fornecedor. `nome`
 * vazio ou UF fora do formato voltam como `{ error }` em vez de deixar o banco
 * rejeitar com um erro de constraint cru (a UF também tem `check` no schema —
 * esta validação só existe para dar mensagem amigável antes de chegar lá).
 */
export function lerDadosTerceiro(fd: FormData): DadosTerceiro | { error: string } {
  const nome = String(fd.get('nome') ?? '').trim();
  if (!nome) return { error: 'Informe o nome.' };

  const uf = ouNulo(fd, 'uf')?.toUpperCase() ?? null;
  if (uf && !UF_RE.test(uf)) return { error: 'Estado inválido. Use a sigla, ex.: SP.' };

  const telefone = ouNulo(fd, 'telefone');

  return {
    nome,
    contato_responsavel: ouNulo(fd, 'contatoResponsavel'),
    email: ouNulo(fd, 'email'),
    telefone: telefone ? soDigitos(telefone) : null,
    cidade: ouNulo(fd, 'cidade'),
    uf,
  };
}
