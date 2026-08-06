# Cadastro Completo de Usuário — Design

**Data:** 2026-08-06
**Status:** aprovado (brainstorming)
**Branch:** `dev`

## 1. Objetivo

O cadastro de usuário do Cofre guarda hoje apenas o necessário para autenticar: nome, e-mail,
senha, papel e estado. O cliente precisa que ele vire o cadastro real da pessoa — contato,
endereço, documentos e datas de vínculo — porque o Cofre é o hub e é onde a identidade de cada
pessoa já vive.

Junto disso, a tela de usuários deixa de ser exclusiva do master: cada pessoa passa a enxergar e
manter os próprios dados de contato.

**Escopo desta rodada:** campos cadastrais e a tela nova. Controle de permissão por rota dentro
dos módulos (ex.: quais páginas do Gestor de Projetos cada pessoa acessa) é assunto de um segundo
spec — ver seção 10.

## 2. Campos

| Campo | Tipo | Cifrado | Obrigatório |
|---|---|---|---|
| nome | text | não | sim (já é hoje) |
| e-mail | text | não | sim (já é hoje) |
| telefone | text | não | não |
| endereço: CEP, logradouro, número, complemento, bairro, cidade, UF | text (7 colunas) | não | não |
| data de nascimento | date | não | não |
| CPF | bytea (ct/iv/tag) + `cpf_hmac` | **sim** | não |
| identidade (RG) | bytea (ct/iv/tag) | **sim** | não |
| órgão expedidor do RG | text | não | não |
| CNPJ | text | não | não |
| data de contratação | date | não | não |
| data de demissão | date | não | não |

Nome e e-mail seguem sendo os únicos obrigatórios. Exigir mais travaria a edição dos usuários que
já existem em produção, que não têm nenhum desses dados preenchidos.

RG aceita letras: várias UFs emitem documento alfanumérico, e alguns terminam em `X`. Validar
formato de RG não é possível de forma confiável — cada estado tem o seu — então o campo é texto
livre, e o órgão expedidor (ex.: `SSP/SP`) fica ao lado, em claro, porque não identifica ninguém
sozinho.

## 3. Schema

Migration nova: `db/migrations/004_user_details.sql`.

```sql
create table user_details (
  user_id            uuid primary key references users(id) on delete cascade,
  telefone           text,
  cep                text,
  logradouro         text,
  numero             text,
  complemento        text,
  bairro             text,
  cidade             text,
  uf                 text check (uf is null or uf ~ '^[A-Z]{2}$'),
  data_nascimento    date,
  cpf_ct             bytea,
  cpf_iv             bytea,
  cpf_tag            bytea,
  cpf_hmac           bytea unique,
  rg_ct              bytea,
  rg_iv              bytea,
  rg_tag             bytea,
  rg_orgao_expedidor text,
  cnpj               text,
  data_contratacao   date,
  data_demissao      date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

**Por que tabela separada, e não colunas em `users`.** `lib/db/users.ts` faz
`select * from users where id = ...` dentro de `findUserById`, que roda em **todo request
autenticado** via `requireUser()`. Colocar ~20 colunas ali — incluindo os blobs cifrados de CPF e
RG — faria cada request arrastar documento pessoal pela memória só para validar sessão. Com
`user_details` à parte, `users` continua sendo identidade e autenticação, e nenhuma consulta
existente muda.

A linha de `user_details` é criada junto com o usuário, vazia. Assim o resto do código nunca
precisa tratar "existe usuário sem detalhes"; leitura e atualização assumem a linha presente.

Para essa premissa valer desde o primeiro deploy, a própria migration preenche os usuários que já
existem em produção:

```sql
insert into user_details (user_id) select id from users;
```

Sem esse backfill, os usuários atuais abririam o modal sem linha correspondente e todo leitor
precisaria de um caminho alternativo — exatamente o caso que a premissa quer eliminar.

## 4. Criptografia dos documentos

CPF e RG usam `lib/crypto.ts` (AES-256-GCM), o mesmo das senhas do cofre, com AAD prendendo o
valor à linha **e** ao campo: `${user_id}:cpf` e `${user_id}:rg`. Sem o campo no AAD, quem tiver
escrita no banco copiaria `rg_ct/iv/tag` para `cpf_ct/iv/tag` e leria um pelo outro — é a mesma
razão documentada em `lib/crypto.ts`.

Como o AAD depende do `user_id`, o id precisa existir antes de cifrar. O projeto já resolve isso
em `insertCredential`, gerando o uuid na aplicação com `randomUUID()` antes do insert; a criação
de usuário passa a fazer o mesmo.

### Unicidade de CPF

Coluna cifrada não aceita `UNIQUE`: cada cifragem gera IV novo, então o mesmo CPF produz bytes
diferentes a cada gravação. A alternativa — decifrar todas as linhas a cada salvamento para
comparar — é O(n) e piora conforme o cadastro cresce.

Solução: `cpf_hmac`, um HMAC-SHA256 determinístico do CPF (só dígitos), com `unique`. A chave sai
de `VAULT_KEY` por HKDF-SHA256 com `info = 'cpf-index'`, em `lib/crypto.ts`:

```ts
export function cpfHmac(cpfDigitos: string): Buffer
```

Derivar em vez de usar `VAULT_KEY` diretamente evita empregar a mesma chave para cifrar e para
indexar. Não entra variável de ambiente nova — uma a mais seria mais uma coisa para esquecer de
cadastrar na Vercel, que já foi causa de incidente neste projeto.

O HMAC é determinístico por construção: dois cadastros com o mesmo CPF colidem no índice e o
segundo falha com `23505`, tratado como "CPF já cadastrado" — mesmo padrão que `saveUser` já usa
para e-mail duplicado.

## 5. Telas

### Rota

Tela nova em **`/usuarios`**, dentro do route group `app/(app)/`. Fica fora de `/admin` porque
passa a atender usuário comum, e no projeto tudo sob `/admin` significa master-only
(`requireMaster()` → `notFound()`). Manter a URL antiga obrigaria quem lê o código a conferir
caso a caso se aquele `/admin/*` exige master ou não.

`/admin/usuarios` é removida — rota, página, client e action. Duas telas de usuário no ar seria
convite a editar na errada. O item "Usuários" do menu passa a apontar para `/usuarios` e fica
visível para todos os papéis.

### Comportamento por papel

| Papel | O que vê |
|---|---|
| master | Grid com nome, telefone e e-mail. Clicar numa linha abre modal com o cadastro completo daquela pessoa, incluindo papel, estado, salas e módulos. |
| comum | Sem grid. Entra direto no modal com os próprios dados. |

A mesma página resolve os dois casos: o server component decide, pelo papel, se busca a lista
inteira ou só o próprio usuário, e passa isso ao client. Não há rota separada para o usuário
comum — seriam duas páginas com o mesmo modal dentro.

A grid mostra telefone, que vive em `user_details`. Entra uma consulta nova em `lib/db/users.ts`
— `listUsersComContato()`, com `left join user_details` — em vez de alterar `listUsers()`, que é
usada em `/admin/salas` e não precisa desse dado. `left join`, e não `join`: um usuário criado por
caminho que não passe pela aplicação continuaria aparecendo na lista em vez de sumir dela.

A consulta da grid **não** traz `cpf_ct` nem `rg_ct`: documento cifrado só é lido pela action de
revelar, para um usuário por vez. Trazer os blobs de todo mundo para desenhar a lista seria expor
na memória do servidor o que a tela nem mostra.

### Revelar CPF e RG

Documentos aparecem mascarados por padrão. Revelar é uma server action explícita, autorizada a
**apenas duas pessoas**: o dono do dado e o master.

A regra é função pura em `lib/authz.ts`, ao lado de `camposEditaveis` (seção 6) e no mesmo padrão
das regras de credencial que já vivem ali:

```ts
export function podeRevelarDados(actor: Actor, alvoUserId: string): boolean {
  return actor.id === alvoUserId || actor.role === 'master';
}
```

Cada revelação grava auditoria com `action: 'view'`, `entityType: 'user'`, `entityId: <alvo>` —
ação e tipo que já existem em `AUDIT_ACTIONS`, sem precisar ampliar a união. `entityType`
distingue revelar documento de pessoa (`user`) de revelar senha do cofre (`credential`).

## 6. Permissão de escrita

| Campo | master | dono |
|---|---|---|
| telefone | ✅ | ✅ |
| endereço (7 campos) | ✅ | ✅ |
| nome, e-mail | ✅ | ❌ |
| papel, ativo, salas, módulos | ✅ | ❌ |
| CPF, RG, órgão expedidor, CNPJ | ✅ | ❌ |
| data de nascimento, contratação, demissão | ✅ | ❌ |

O dono escreve só o que é contato. E-mail é a credencial de login. Documento e datas de vínculo
são dado de identidade e de RH: se a própria pessoa altera sem revisão, o cadastro deixa de servir
como registro confiável.

A regra vive numa função pura em `lib/authz.ts`, testável sem banco, no mesmo padrão de
`canEditCredential`:

```ts
export function camposEditaveis(actor: Actor, alvoUserId: string): 'todos' | 'contato'
```

A server action **reaplica** essa regra no servidor e ignora silenciosamente qualquer campo fora
do permitido — nunca confia no que o formulário enviou. Esconder campo na tela é cosmético; a
barreira é a action, exatamente como `lib/auth/guards.ts` já documenta para o menu.

Um salvamento do master atravessa duas tabelas: nome, e-mail, papel e estado em `users`; o resto
em `user_details`. As duas gravações vão num `sql.transaction`, senão uma falha no meio deixaria o
cadastro pela metade — com o caso pior sendo `data_demissao` gravada sem o `is_active = false` que
deveria acompanhá-la (seção 7).

## 7. Regras de negócio

**Demissão desliga o acesso.** Gravar `data_demissao` põe `is_active = false` no mesmo
`sql.transaction`, e registra auditoria `user_update` com o motivo. O risco concreto é alguém sair
da empresa e continuar com acesso ao cofre de senhas porque ninguém lembrou de desmarcar outra
caixa. Limpar a data de demissão **não** reativa sozinho — reativar é decisão consciente do
master, feita na caixa "ativo".

**CPF e CNPJ validam dígito verificador** antes de gravar, em `lib/documentos.ts`. Rejeitam
também as sequências repetidas (`111.111.111-11` e afins), que passam no cálculo de dígito mas
nunca são documentos reais. Campo vazio é válido: os dois são opcionais.

**Máscaras** na exibição e na digitação: CPF `000.000.000-00`, CNPJ `00.000.000/0000-00`,
CEP `00000-000`, telefone `(00) 00000-0000`. O banco guarda só dígitos; máscara é apresentação.

## 8. Busca de CEP

Preencher o CEP dispara busca que autocompleta logradouro, bairro, cidade e UF.

Fonte: **BrasilAPI** (`https://brasilapi.com.br/api/cep/v2/{cep}`), pública e sem chave.

A chamada sai de uma **server action**, não do navegador. Dois motivos: não expõe o IP de quem
está editando a um terceiro, e permite tratar timeout num lugar só. A action tem timeout curto
(5s) e **falha em silêncio**: se a API não responder, o formulário segue editável e a pessoa
digita à mão. Busca de CEP nunca pode impedir salvar um cadastro.

O CEP digitado é gravado mesmo que a busca falhe.

## 9. Testes

**Puros, sem banco** (`tests/`, ambiente `node`):
- `lib/documentos.ts`: CPF e CNPJ válidos, dígito verificador errado, sequência repetida, string
  vazia, tamanho errado, entrada com máscara e sem máscara.
- `camposEditaveis`: master sobre outro, master sobre si, comum sobre si, comum sobre outro.
- `podeRevelarDados`: as mesmas quatro combinações.
- `cpfHmac`: determinístico (mesma entrada → mesma saída) e sensível (CPFs diferentes → HMACs
  diferentes).

**Integração, contra o banco real** (`tests/integracao.test.ts`, padrão já existente):
- gravar `data_demissao` desativa o usuário na mesma transação;
- CPF duplicado viola `cpf_hmac` e vira erro tratado;
- ida e volta de cifragem: gravar CPF, ler, decifrar, comparar;
- AAD trocado (usar `:rg` para ler `cpf`) falha.

**Componente, jsdom** (`tests/*.test.tsx`, infra já montada):
- master vê grid; usuário comum não vê grid, vê o modal;
- campo fora do escopo do dono chega desabilitado no modal do usuário comum.

Não escrever teste para máscara de digitação nem para o layout do modal — jsdom não computa
layout, e a spec anterior do sidebar já fixou essa regra.

## 10. Fora de escopo (spec 2)

**Permissão por rota dentro dos módulos.** O Gestor de Projetos já tem catálogo de permissão por
página (`src/lib/permissions.ts`: `PERMISSIONS_CATALOG`, chaves `page:/rota`, `ALL_ACCESS`), mas
ele está desligado para quem entra por SSO: `/api/me` devolve `profileId: null`, então
`permissions` fica `[]` e nega tudo — só o master passa, por bypass. Levar esse controle para o
Cofre exige decidir onde mora a verdade da permissão e mexe nos dois repositórios; vira spec
própria.

Também fora desta rodada:
- foto ou avatar de usuário;
- histórico de alterações campo a campo (a auditoria atual registra o evento, não o diff);
- exportação do cadastro;
- reativação automática ao limpar a data de demissão;
- validação de CEP contra o endereço digitado (a busca preenche, mas não impede divergência).
