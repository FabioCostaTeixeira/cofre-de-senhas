import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon>;

let client: Sql | null = null;

/**
 * Cria a conexão só na primeira query, nunca ao importar o módulo. O `next build`
 * importa os módulos de todas as páginas para compilar; como a especificação exige
 * variáveis de ambiente apenas em Production (preview deploy roda em pull request,
 * sem `DATABASE_URL`), o build não pode depender delas — só o request em runtime.
 */
function getClient(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não configurada. Defina a variável de ambiente antes de executar consultas no banco.',
    );
  }
  client = neon(url);
  return client;
}

/**
 * Proxy que preserva a ergonomia de `sql\`select ...\`` e `sql.transaction([...])`
 * em todo o código existente, mas só toca `getClient()` (e portanto só exige
 * `DATABASE_URL`) no instante de uso, nunca no escopo do módulo.
 */
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, thisArg, args) {
    const real = getClient() as unknown as (...a: unknown[]) => unknown;
    return Reflect.apply(real, thisArg, args);
  },
  get(_target, prop, receiver) {
    const real = getClient();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
