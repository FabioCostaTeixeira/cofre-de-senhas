import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export type EncryptedField = { ct: Buffer; iv: Buffer; tag: Buffer };

function key(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (!raw) throw new Error('VAULT_KEY não configurada');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('VAULT_KEY deve ter 32 bytes em base64');
  return buf;
}

/** Cifra um texto. `aad` deve ser o id do registro, para prender o ciphertext à linha. */
export function encrypt(plaintext: string, aad: string): EncryptedField {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ct, iv, tag: cipher.getAuthTag() };
}

/** Decifra. Lança se a tag ou o AAD não conferirem. */
export function decrypt(field: EncryptedField, aad: string): string {
  const decipher = createDecipheriv(ALGO, key(), field.iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(field.tag);
  return Buffer.concat([decipher.update(field.ct), decipher.final()]).toString('utf8');
}

/** Gera uma VAULT_KEY nova. Usado só no setup, fora do runtime. */
export function generateKey(): string {
  return randomBytes(32).toString('base64');
}
