import { sql } from '@/lib/db/client';
import { decrypt, encrypt } from '@/lib/crypto';
import { cpfHmac } from '@/lib/crypto';
import { soDigitos } from '@/lib/documentos';
import { assertUuid } from '@/lib/validation';
import type { Pessoa } from '@/lib/types';

/** Campos que o próprio dono pode alterar. */
export type DadosContato = {
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

/** Contato mais o que só o master altera. `cpf` e `rg` vêm em claro e são cifrados aqui. */
export type DadosPessoa = DadosContato & {
  data_nascimento: string | null;
  cpf: string | null;
  rg: string | null;
  rg_orgao_expedidor: string | null;
  cnpj: string | null;
};

/**
 * Seleção explícita, sem `select *`: os blobs cifrados nunca saem daqui para desenhar
 * tela. `tem_cpf`/`tem_rg` dizem se existe documento guardado, o suficiente para a
 * tela decidir se mostra o botão de revelar.
 */
export async function getPessoa(id: string): Promise<Pessoa | null> {
  assertUuid(id);
  const rows = (await sql`
    select id, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf,
           data_nascimento, rg_orgao_expedidor, cnpj,
           (cpf_ct is not null) as tem_cpf,
           (rg_ct is not null) as tem_rg
      from pessoas where id = ${id}`) as Pessoa[];
  return rows[0] ?? null;
}

/** Usado no cadastro para detectar readmissão: CPF já conhecido → pessoa já existe. */
export async function findPessoaIdByCpf(cpf: string): Promise<string | null> {
  const digitos = soDigitos(cpf);
  if (digitos.length !== 11) return null;
  const rows = (await sql`
    select id from pessoas where cpf_hmac = ${cpfHmac(digitos)}`) as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Única função que lê os blobs cifrados. Quem chama já checou `podeRevelarDados` e
 * é responsável por auditar.
 */
export async function revelarDocumentos(
  pessoaId: string,
): Promise<{ cpf: string | null; rg: string | null }> {
  assertUuid(pessoaId);
  const rows = (await sql`
    select cpf_ct, cpf_iv, cpf_tag, rg_ct, rg_iv, rg_tag
      from pessoas where id = ${pessoaId}`) as {
        cpf_ct: Buffer | null; cpf_iv: Buffer | null; cpf_tag: Buffer | null;
        rg_ct: Buffer | null; rg_iv: Buffer | null; rg_tag: Buffer | null;
      }[];
  const r = rows[0];
  if (!r) return { cpf: null, rg: null };

  const cpf = r.cpf_ct && r.cpf_iv && r.cpf_tag
    ? decrypt({ ct: r.cpf_ct, iv: r.cpf_iv, tag: r.cpf_tag }, `${pessoaId}:cpf`)
    : null;
  const rg = r.rg_ct && r.rg_iv && r.rg_tag
    ? decrypt({ ct: r.rg_ct, iv: r.rg_iv, tag: r.rg_tag }, `${pessoaId}:rg`)
    : null;
  return { cpf, rg };
}

// (não existe outra função de leitura aqui: quem precisa do documento chama
// `revelarDocumentos`, que é a única que toca nos blobs cifrados.)

export async function updateContato(pessoaId: string, d: DadosContato): Promise<void> {
  assertUuid(pessoaId);
  await sql`
    update pessoas
       set telefone = ${d.telefone}, cep = ${d.cep}, logradouro = ${d.logradouro},
           numero = ${d.numero}, complemento = ${d.complemento}, bairro = ${d.bairro},
           cidade = ${d.cidade}, uf = ${d.uf}, updated_at = now()
     where id = ${pessoaId}`;
}

/**
 * Atualiza o cadastro inteiro. CPF e RG só são regravados quando vêm preenchidos:
 * campo em branco no formulário significa "não mexi nele", não "apague o documento" —
 * a tela mostra o documento mascarado, então o master normalmente salva sem redigitar.
 * Para limpar, existe a string `'-'`, tratada como remoção explícita.
 */
export async function updatePessoa(pessoaId: string, d: DadosPessoa): Promise<void> {
  assertUuid(pessoaId);
  await updateContato(pessoaId, d);

  await sql`
    update pessoas
       set data_nascimento = ${d.data_nascimento},
           rg_orgao_expedidor = ${d.rg_orgao_expedidor},
           cnpj = ${d.cnpj ? soDigitos(d.cnpj) : null},
           updated_at = now()
     where id = ${pessoaId}`;

  if (d.cpf === '-') {
    await sql`
      update pessoas set cpf_ct = null, cpf_iv = null, cpf_tag = null, cpf_hmac = null
       where id = ${pessoaId}`;
  } else if (d.cpf) {
    const digitos = soDigitos(d.cpf);
    const e = encrypt(digitos, `${pessoaId}:cpf`);
    await sql`
      update pessoas
         set cpf_ct = ${e.ct}, cpf_iv = ${e.iv}, cpf_tag = ${e.tag},
             cpf_hmac = ${cpfHmac(digitos)}
       where id = ${pessoaId}`;
  }

  if (d.rg === '-') {
    await sql`
      update pessoas set rg_ct = null, rg_iv = null, rg_tag = null where id = ${pessoaId}`;
  } else if (d.rg) {
    const e = encrypt(d.rg.trim(), `${pessoaId}:rg`);
    await sql`
      update pessoas set rg_ct = ${e.ct}, rg_iv = ${e.iv}, rg_tag = ${e.tag}
       where id = ${pessoaId}`;
  }
}
