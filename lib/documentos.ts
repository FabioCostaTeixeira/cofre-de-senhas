/**
 * Validação e formatação de documentos brasileiros. Sem I/O e sem dependência de
 * banco: o banco guarda só dígitos, e máscara é assunto de apresentação.
 */

export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Todos os dígitos iguais passam no cálculo do DV, mas nunca são documento real. */
function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function digitoVerificador(digitos: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;

  const dv1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

export function validarCnpj(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;

  const dv1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}

/**
 * As máscaras devolvem a entrada intacta quando o tamanho não bate. Truncar ou
 * completar esconderia dado ruim atrás de um formato bonito.
 */
export function mascararCpf(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length !== 11) return digitos;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararCnpj(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length !== 14) return digitos;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function mascararCep(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length !== 8) return digitos;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function mascararTelefone(digitos: string): string {
  const d = soDigitos(digitos);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}
