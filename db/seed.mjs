import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

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
  const res = await client.query(
    `insert into users (email, name, password_hash, role, must_change_password)
     values ($1, $2, $3, 'master', true)
     on conflict (email) do nothing
     returning id`,
    [SEED_MASTER_EMAIL.toLowerCase(), SEED_MASTER_NAME, hash],
  );

  console.log(res.rowCount ? `master criado: ${SEED_MASTER_EMAIL}` : 'master já existia');
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
