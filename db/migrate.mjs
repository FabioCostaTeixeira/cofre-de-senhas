import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { config } from 'dotenv';

// Mesma precedência do Next: `.env.local` primeiro, `.env` como base.
config({ path: '.env.local' });
config();

const dir = path.join(process.cwd(), 'db', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    // O Neon exige TLS e emite certificado válido; validar o certificado (em vez de
    // desligar `rejectUnauthorized`) impede um ataque man-in-the-middle na conexão
    // que carrega o schema do cofre e o hash bcrypt do master.
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();

  await client.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);

  const applied = new Set(
    (await client.query('select name from _migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (já aplicada)`);
      continue;
    }
    const sqlText = await readFile(path.join(dir, file), 'utf8');
    console.log(`+ aplicando ${file}...`);
    await client.query('begin');
    try {
      await client.query(sqlText);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`  ok`);
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }

  await client.end();
  console.log('migrations concluídas');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
