/**
 * Sanitização defensiva do `metadata` do audit log. Nenhum ponto de chamada atual
 * passa segredo de propósito, mas o log é lido em tela pelo master, então isso serve
 * de rede de segurança contra um futuro `audit({ metadata: { ...algo } })` incluir uma
 * chave sensível por acidente (ex.: espalhar um objeto inteiro no metadata).
 *
 * Função pura (sem banco, sem I/O) para poder ser testada isoladamente.
 */

/** Chaves cujo nome sugere conteúdo sensível são removidas, não mascaradas. */
const CHAVE_SUSPEITA = /senha|password|secret|token|hash|chave|key/i;

/** Valores de texto muito longos são truncados para não inchar o log. */
const TAMANHO_MAXIMO_VALOR = 500;

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(metadata)) {
    if (CHAVE_SUSPEITA.test(chave)) continue;
    if (typeof valor === 'string' && valor.length > TAMANHO_MAXIMO_VALOR) {
      resultado[chave] = `${valor.slice(0, TAMANHO_MAXIMO_VALOR)}…`;
      continue;
    }
    resultado[chave] = valor;
  }
  return resultado;
}
