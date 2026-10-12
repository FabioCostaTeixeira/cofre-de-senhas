import Link from 'next/link';

export default async function TiPage() {
  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Módulo de TI — Projetos</h1>
      </div>
      <div className="glass p-6 space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Bem-vindo ao setor de TI. Aqui gerenciaremos os projetos (Epics), tarefas (Features) e atividades (User Stories) de forma ágil.
        </p>
        <div className="flex gap-3">
          <Link href="/ti/projetos" className="btn btn-primary">
            Gerenciar Projetos
          </Link>
        </div>
      </div>
    </main>
  );
}
