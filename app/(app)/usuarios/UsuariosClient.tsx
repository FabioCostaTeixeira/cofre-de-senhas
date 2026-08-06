'use client';

import { useActionState, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { SeletorSalas, type SalaOpcao } from '@/components/SeletorSalas';
import { SeletorModulos } from '@/components/SeletorModulos';
import { MODULES } from '@/lib/modules';
import { formatarDataBR, mascararCep, mascararCpf, mascararTelefone, soDigitos } from '@/lib/documentos';
import {
  buscarCep, buscarDadosUsuario, criarUsuario, resetUserPassword, revelarDocumentosAction,
  salvarCadastro, type CadastroState, type DadosUsuarioAlvo,
} from './actions';
import type { EscopoCampos } from '@/lib/authz';
import type { Pessoa, Role, UserComContato } from '@/lib/types';
import type { VinculoResumo } from '@/lib/db/users';

const inicial: CadastroState = {};

const DICA_MASTER = 'O master enxerga todas as salas por definição; a seleção fica travada.';

/**
 * `<input type="date">` nativo formata mm/dd/yyyy ou dd/mm/yyyy conforme o IDIOMA DO
 * NAVEGADOR, não o `lang` da página — e o destaque azul do segmento em edição
 * (`mm`/`dd`/`aaaa`) é chrome do próprio navegador, não texto: `color: transparent`
 * não esconde, só o texto some, a caixinha de seleção do segmento continua visível.
 * Não dá pra forçar dd/mm/aaaa digitando direto num `type="date"`.
 *
 * Solução: quem recebe a digitação é um `<input type="text">` comum, com a mesma
 * máscara ao vivo dos outros campos (CPF, telefone, CEP) — nunca mostra segmento do
 * navegador. Um `<input type="date">` fica escondido (0×0, fora do fluxo, sem tab),
 * só existe para acionar `.showPicker()` no botão de calendário; ao escolher uma data
 * nele, sincroniza de volta pro campo de texto. O valor que vai pro formulário é um
 * `<input type="hidden">` controlado pelo mesmo estado ISO dos dois — nenhum dos dois
 * inputs visíveis carrega o `name`.
 */
function CampoData({
  name, label, defaultValue, disabled,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  const [iso, setIso] = useState(defaultValue ?? '');
  const [texto, setTexto] = useState(defaultValue ? formatarDataBR(defaultValue) : '');
  const dateRef = useRef<HTMLInputElement>(null);

  function digitar(valorDigitado: string) {
    const digitos = soDigitos(valorDigitado).slice(0, 8);
    let formatado = digitos;
    if (digitos.length > 4) formatado = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    else if (digitos.length > 2) formatado = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    setTexto(formatado);
    setIso(digitos.length === 8 ? `${digitos.slice(4, 8)}-${digitos.slice(2, 4)}-${digitos.slice(0, 2)}` : '');
  }

  function escolherPeloCalendario(valorIso: string) {
    setIso(valorIso);
    setTexto(valorIso ? formatarDataBR(valorIso) : '');
  }

  return (
    <label className="block space-y-1">
      <span className="text-sm">{label}</span>
      <div className="relative">
        <input type="hidden" name={name} value={iso} disabled={disabled} />
        <input
          type="text" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10}
          className="input pr-9" value={texto} disabled={disabled}
          onChange={(e) => digitar(e.target.value)}
        />
        <input
          ref={dateRef} type="date" value={iso} disabled={disabled} tabIndex={-1} aria-hidden="true"
          className="absolute h-0 w-0 opacity-0"
          onChange={(e) => escolherPeloCalendario(e.target.value)}
        />
        <button
          type="button" disabled={disabled}
          className="absolute inset-y-0 right-0 flex items-center px-3"
          style={{ color: 'var(--text-dim)' }}
          onClick={() => dateRef.current?.showPicker?.()}
          aria-label={`Abrir calendário: ${label}`}
        >
          <Calendar size={16} />
        </button>
      </div>
    </label>
  );
}

export function UsuariosClient({
  escopo, usuarios, eu, pessoa, salas, salasDoUsuario, modulosDoUsuario, vinculos,
}: {
  escopo: EscopoCampos;
  usuarios: UserComContato[];
  eu: UserComContato | null;
  pessoa: Pessoa | null;
  salas: SalaOpcao[];
  salasDoUsuario: string[];
  modulosDoUsuario: string[];
  vinculos: VinculoResumo[];
}) {
  // Fechado por padrão: o master vê a grid primeiro, o modal só abre ao clicar numa
  // linha. (O ramo `escopo !== 'todos'`, abaixo, não usa este estado — ele nunca tem
  // grid, então renderiza o próprio modal direto.)
  const [aberto, setAberto] = useState<DadosUsuarioAlvo | null>(null);
  const [carregando, setCarregando] = useState(false);

  if (escopo !== 'todos') {
    return eu && pessoa
      ? <Modal usuario={eu} pessoa={pessoa} escopo={escopo} salas={salas}
               salasDoUsuario={salasDoUsuario} modulosDoUsuario={modulosDoUsuario}
               vinculos={vinculos} onFechar={null} />
      : <p>Cadastro não encontrado.</p>;
  }

  async function abrir(usuario: UserComContato) {
    setCarregando(true);
    const r = await buscarDadosUsuario(usuario.id);
    setCarregando(false);
    if ('error' in r) return; // mensagem de erro pode ser acrescentada depois; não é o foco desta task
    setAberto(r);
  }

  return (
    <div className="space-y-4">
      <NovoUsuarioForm salas={salas} />
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            <th className="text-left p-2">Nome</th>
            <th className="text-left p-2">Telefone</th>
            <th className="text-left p-2">E-mail</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="cursor-pointer" onClick={() => void abrir(u)}>
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.telefone ? mascararTelefone(u.telefone) : '—'}</td>
              <td className="p-2">{u.email}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {aberto && (
        <Modal key={aberto.usuario.id} usuario={aberto.usuario} pessoa={aberto.pessoa}
               escopo={escopo} salas={salas}
               salasDoUsuario={aberto.salasDoUsuario} modulosDoUsuario={aberto.modulosDoUsuario}
               vinculos={aberto.vinculos} onFechar={() => setAberto(null)} />
      )}
      {carregando && <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Carregando…</p>}
    </div>
  );
}

function NovoUsuarioForm({ salas }: { salas: SalaOpcao[] }) {
  const [state, action, pending] = useActionState(criarUsuario, inicial);
  const [papel, setPapel] = useState<Role>('user');
  const [salasSel, setSalasSel] = useState<string[]>([]);
  const [modulosSel, setModulosSel] = useState<string[]>([]);
  const [cpfDigitos, setCpfDigitos] = useState('');

  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSalasSel(novo === 'master' ? salas.map((s) => s.id) : []);
    setModulosSel(novo === 'master' ? MODULES.map((m) => m.key) : []);
  }

  return (
    <details className="glass p-5">
      <summary className="cursor-pointer font-semibold">Novo usuário</summary>
      <form action={action} className="space-y-4 mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Nome</span>
            <input name="name" className="input" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">E-mail</span>
            <input name="email" type="email" className="input" required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Senha inicial</span>
            <input name="senhaInicial" type="password" autoComplete="new-password"
                   className="input" minLength={10} required />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Papel</span>
            <select name="role" className="input" value={papel}
                    onChange={(e) => trocarPapel(e.target.value as Role)}>
              <option value="user">Usuário</option>
              <option value="master">Master</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm">CPF (opcional)</span>
            <input name="cpf" className="input" inputMode="numeric" maxLength={14}
                   value={mascararCpf(cpfDigitos)}
                   onChange={(e) => setCpfDigitos(soDigitos(e.target.value))}
                   placeholder="529.982.247-25" />
          </label>
          <CampoData name="dataContratacao" label="Data de contratação" />
        </div>

        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Se o CPF já pertencer a uma pessoa cadastrada, o vínculo é criado para ela
          (readmissão) — salas e módulos não são herdados do vínculo anterior.
        </p>

        <SeletorSalas
          salas={salas} selecionadas={salasSel} onChange={setSalasSel}
          desabilitado={papel === 'master'}
          dica={papel === 'master' ? DICA_MASTER : undefined}
        />
        <SeletorModulos
          modulos={MODULES} selecionados={modulosSel} onChange={setModulosSel}
          desabilitado={papel === 'master'}
          dica={papel === 'master' ? DICA_MASTER : undefined}
        />

        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Criar usuário</button>
      </form>
    </details>
  );
}

function Modal({
  usuario, pessoa, escopo, salas, salasDoUsuario, modulosDoUsuario, vinculos, onFechar,
}: {
  usuario: UserComContato;
  pessoa: Pessoa;
  escopo: EscopoCampos;
  salas: SalaOpcao[];
  salasDoUsuario: string[];
  modulosDoUsuario: string[];
  vinculos: VinculoResumo[];
  onFechar: (() => void) | null;
}) {
  const [state, action, pending] = useActionState(salvarCadastro, inicial);
  const [docs, setDocs] = useState<{ cpf: string | null; rg: string | null } | null>(null);
  const [endereco, setEndereco] = useState({
    logradouro: pessoa.logradouro ?? '', bairro: pessoa.bairro ?? '',
    cidade: pessoa.cidade ?? '', uf: pessoa.uf ?? '',
  });
  // Guardam só os dígitos; a máscara é aplicada no `value` na hora de renderizar, não no
  // estado — assim o servidor sempre recebe o de-para certo (`soDigitos` de novo lá, mas
  // já vem limpo) e a máscara nunca fica "presa" atrás de um valor antigo formatado.
  const [telefoneDigitos, setTelefoneDigitos] = useState(pessoa.telefone ?? '');
  const [cepDigitos, setCepDigitos] = useState(pessoa.cep ?? '');
  const [cpfDigitos, setCpfDigitos] = useState(docs?.cpf ?? '');
  // `SeletorSalas` e `SeletorModulos` são controlados e geram os
  // `<input type="hidden" name="salas">` a partir da seleção. Sem estado real aqui, a
  // caixa marcaria na tela e nada chegaria na Server Action.
  const [salasSel, setSalasSel] = useState<string[]>(salasDoUsuario);
  const [modulosSel, setModulosSel] = useState<string[]>(modulosDoUsuario);
  const [papel, setPapel] = useState<Role>(usuario.role);
  const escopoLimitado = escopo !== 'todos';
  const [resetando, setResetando] = useState(false);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPassword, inicial);

  // Master enxerga tudo por definição: trocar o papel redefine a seleção inteira.
  function trocarPapel(novo: Role) {
    setPapel(novo);
    setSalasSel(novo === 'master' ? salas.map((s) => s.id) : salasDoUsuario);
    setModulosSel(novo === 'master' ? MODULES.map((m) => m.key) : modulosDoUsuario);
  }

  async function preencherPorCep(cep: string) {
    const achado = await buscarCep(cep);
    if (achado) setEndereco(achado);
  }

  // Dispara assim que o CEP completa 8 dígitos, sem esperar o campo perder o foco —
  // antes só rodava no blur, e quem não clicava fora do campo (ex.: ia direto pro
  // próximo campo com Tab rápido, ou colava e clicava em Salvar) nunca via a busca rodar.
  function digitarCep(valor: string) {
    const digitos = soDigitos(valor);
    setCepDigitos(digitos);
    if (digitos.length === 8) void preencherPorCep(digitos);
  }

  async function revelar() {
    const r = await revelarDocumentosAction(usuario.id);
    if ('error' in r) return;
    setDocs(r);
    setCpfDigitos(r.cpf ?? '');
  }

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold flex-1">{usuario.name}</h2>
        {onFechar && <button type="button" className="btn" onClick={onFechar}>Fechar</button>}
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={usuario.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm">Nome</span>
            <input name="name" className="input" defaultValue={usuario.name} disabled={escopoLimitado} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">E-mail</span>
            <input name="email" className="input" defaultValue={usuario.email} disabled />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Telefone</span>
            <input name="telefone" className="input" inputMode="numeric" maxLength={15}
                   value={mascararTelefone(telefoneDigitos)}
                   onChange={(e) => setTelefoneDigitos(soDigitos(e.target.value))} />
          </label>
          <CampoData name="dataNascimento" label="Data de nascimento"
                     defaultValue={pessoa.data_nascimento ?? ''} disabled={escopoLimitado} />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Endereço</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">CEP</span>
              <input name="cep" className="input" inputMode="numeric" maxLength={9}
                     value={mascararCep(cepDigitos)}
                     onChange={(e) => digitarCep(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Logradouro</span>
              <input name="logradouro" className="input" value={endereco.logradouro}
                     onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Número</span>
              <input name="numero" className="input" defaultValue={pessoa.numero ?? ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Complemento</span>
              <input name="complemento" className="input" defaultValue={pessoa.complemento ?? ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Bairro</span>
              <input name="bairro" className="input" value={endereco.bairro}
                     onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Cidade</span>
              <input name="cidade" className="input" value={endereco.cidade}
                     onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">UF</span>
              <input name="uf" className="input" maxLength={2} value={endereco.uf}
                     onChange={(e) => setEndereco({ ...endereco, uf: e.target.value.toUpperCase() })} />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Documentos</legend>
          {(pessoa.tem_cpf || pessoa.tem_rg) && !docs && (
            <button type="button" className="btn" onClick={() => void revelar()}>
              Revelar CPF e RG
            </button>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm">CPF</span>
              <input name="cpf" className="input" inputMode="numeric" maxLength={14}
                     disabled={escopoLimitado} value={mascararCpf(cpfDigitos)}
                     onChange={(e) => setCpfDigitos(soDigitos(e.target.value))}
                     placeholder={pessoa.tem_cpf ? '•••.•••.•••-••' : ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Identidade (RG)</span>
              <input name="rg" className="input" disabled={escopoLimitado}
                     defaultValue={docs?.rg ?? ''}
                     placeholder={pessoa.tem_rg ? '••••••••' : ''} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Órgão expedidor</span>
              <input name="rgOrgao" className="input" disabled={escopoLimitado}
                     defaultValue={pessoa.rg_orgao_expedidor ?? ''} placeholder="SSP/SP" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">CNPJ</span>
              <input name="cnpj" className="input" disabled={escopoLimitado}
                     defaultValue={pessoa.cnpj ?? ''} />
            </label>
          </div>
        </fieldset>

        {!escopoLimitado && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoData name="dataContratacao" label="Data de contratação"
                         defaultValue={usuario.data_contratacao ?? ''} />
              <CampoData name="dataDemissao" label="Data de demissão"
                         defaultValue={usuario.data_demissao ?? ''} />
              <label className="block space-y-1">
                <span className="text-sm">Papel</span>
                <select name="role" className="input" value={papel}
                        onChange={(e) => trocarPapel(e.target.value as Role)}>
                  <option value="user">Usuário</option>
                  <option value="master">Master</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={usuario.is_active} />
                Ativo
              </label>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Preencher a data de demissão desativa o acesso imediatamente.
            </p>

            <SeletorSalas
              salas={salas} selecionadas={salasSel} onChange={setSalasSel}
              desabilitado={papel === 'master'}
              dica={papel === 'master' ? DICA_MASTER : undefined}
            />
            <SeletorModulos
              modulos={MODULES} selecionados={modulosSel} onChange={setModulosSel}
              desabilitado={papel === 'master'}
              dica={papel === 'master' ? DICA_MASTER : undefined}
            />
          </>
        )}

        {state.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
        {state.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
        <button className="btn btn-primary" disabled={pending}>Salvar</button>
      </form>

      {!escopoLimitado && (
        <div className="space-y-2">
          <button type="button" className="btn" onClick={() => setResetando(!resetando)}>
            {resetando ? 'Cancelar' : 'Resetar senha'}
          </button>
          {resetando && (
            <form action={resetAction} className="flex items-end gap-3">
              <input type="hidden" name="id" value={usuario.id} />
              <label className="space-y-1 flex-1">
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Nova senha</span>
                <input name="novaSenha" type="password" autoComplete="new-password"
                       className="input" minLength={10} required />
              </label>
              <button className="btn btn-primary" disabled={resetPending}>Redefinir</button>
            </form>
          )}
          {resetState.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{resetState.error}</p>}
          {resetState.ok && <p className="text-sm" style={{ color: 'var(--ok)' }}>{resetState.ok}</p>}
        </div>
      )}

      {vinculos.length > 1 && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">Passagens anteriores</h3>
          <ul className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {vinculos.map((v) => (
              <li key={v.id}>
                {v.name} — {v.data_contratacao ?? '?'} até {v.data_demissao ?? 'atual'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
