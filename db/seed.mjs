import bcrypt from 'bcryptjs';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

// Mesma precedência do Next: `.env.local` primeiro, `.env` como base.
config({ path: '.env.local' });
config();

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');

  const { SEED_MASTER_EMAIL, SEED_MASTER_NAME, SEED_MASTER_PASSWORD } = process.env;
  if (!SEED_MASTER_EMAIL || !SEED_MASTER_NAME || !SEED_MASTER_PASSWORD) {
    throw new Error('Defina SEED_MASTER_EMAIL, SEED_MASTER_NAME e SEED_MASTER_PASSWORD');
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    // O Neon exige TLS e emite certificado válido; validar o certificado (em vez de
    // desligar `rejectUnauthorized`) impede um ataque man-in-the-middle na conexão
    // que carrega o hash bcrypt do master.
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();

  const hash = await bcrypt.hash(SEED_MASTER_PASSWORD, 12);
  const email = SEED_MASTER_EMAIL.toLowerCase();

  // Não dá mais pra confiar em `ON CONFLICT (email)`: o índice novo
  // (users_email_ativo_idx) é parcial (`where data_demissao is null`), e o Postgres só
  // infere conflito a partir de constraint/índice não-parcial. Verifica na mão se já
  // existe vínculo ativo com esse e-mail antes de inserir.
  const existente = await client.query(
    `select id from users where email = $1 and data_demissao is null`,
    [email],
  );

  if (existente.rowCount) {
    console.log('master já existia');
  } else {
    // pessoa_id é NOT NULL: cria a pessoa antes do vínculo, mesmo padrão de
    // lib/db/users.ts:createUserComPessoa (id gerado fora de transação interativa).
    const pessoaId = randomUUID();
    await client.query('begin');
    try {
      await client.query(`insert into pessoas (id) values ($1)`, [pessoaId]);
      await client.query(
        `insert into users (email, name, password_hash, role, must_change_password, pessoa_id)
         values ($1, $2, $3, 'master', true, $4)`,
        [email, SEED_MASTER_NAME, hash, pessoaId],
      );
      await client.query('commit');
      console.log(`master criado: ${SEED_MASTER_EMAIL}`);
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
