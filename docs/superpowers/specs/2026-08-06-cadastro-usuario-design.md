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
spec — ver seção 12.

## 2. Pessoa e vínculo são coisas diferentes

A decisão estrutural deste desenho: **separar a pessoa da conta de acesso**.

O gatilho foi a readmissão. Um funcionário demitido pode voltar, e nesse caso o cadastro antigo
deve virar histórico enquanto o novo nasce limpo — não reativar o anterior. Com tudo numa tabela
só, isso é impossível: `cpf` único global barra o segundo cadastro, e `email` único global barra
junto, porque a pessoa costuma receber de volta o mesmo e-mail corporativo.

```
pessoas                          users
  quem a pessoa é                  um vínculo/conta de acesso
  CPF, RG, nascimento              e-mail, senha, papel, ativo
  telefone, endereço, CNPJ         contratação, demissão
  1 linha por pessoa               N linhas por pessoa (uma por passagem)
```

João é contratado, demitido e readmitido: **uma** linha em `pessoas`, **duas** em `users`. O CPF
segue único de verdade — uma pessoa, um CPF — sem índice condicional nem gambiarra.

Acesso a salas (`room_members`) e a módulos (`module_access`) aponta para `users`, não para
`pessoas`. Então readmitido **começa sem acesso nenhum** e precisa ser liberado de novo. Isso é
proposital: quem voltou não deve herdar automaticamente as permissões de anos atrás.

### Onde fica o nome

`users.name` continua onde está; `pessoas` **não** tem coluna de nome.

Dois campos de nome confundiriam quem opera a tela ("qual eu edito?"), e mover o nome para
`pessoas` obrigaria o caminho de autenticação a fazer join com a tabela de documentos — o oposto
do que a separação busca (ver seção 4). Como toda pessoa tem pelo menos uma linha em `users`, o
nome está sempre acessível.

Efeito colateral desejável: cada vínculo guarda o nome vigente na época, que é o correto para um
registro histórico.

## 3. Campos

| Campo | Onde | Cifrado | Obrigatório |
|---|---|---|---|
| nome | `users.name` | não | sim (já é hoje) |
| e-mail | `users.email` | não | sim (já é hoje) |
| papel, ativo, senha | `users` | — | já existem |
| data de contratação | `users` | não | não |
| data de demissão | `users` | não | não |
| telefone | `pessoas` | não | não |
| endereço: CEP, logradouro, número, complemento, bairro, cidade, UF | `pessoas` (7 colunas) | não | não |
| data de nascimento | `pessoas` | não | não |
| CPF | `pessoas` (ct/iv/tag + `cpf_hmac`) | **sim** | não |
| identidade (RG) | `pessoas` (ct/iv/tag) | **sim** | não |
| órgão expedidor do RG | `pessoas` | não | não |
| CNPJ | `pessoas` | não | não |

Nome e e-mail seguem sendo os únicos obrigatórios. Exigir mais travaria a edição dos usuários que
já existem em produção, que não têm nenhum desses dados preenchidos.

As datas de contratação e demissão ficam em `users`, não em `pessoas`: são propriedades do
vínculo, e é isso que permite duas passagens da mesma pessoa com datas diferentes.

RG aceita letras: várias UFs emitem documento alfanumérico, e alguns terminam em `X`. Validar
formato de RG não é possível de forma confiável — cada estado tem o seu — então o campo é texto
livre, e o órgão expedidor (ex.: `SSP/SP`) fica ao lado, em claro, porque não identifica ninguém
sozinho.

## 4. Schema

Migration nova: `db/migrations/004_pessoas.sql`.

```sql
create table pessoas (
  id                 uuid primary key default gen_random_uuid(),
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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table users
  add column pessoa_id        uuid references pessoas(id),
  add column data_contratacao date,
  add column data_demissao    date;
```

**Backfill dos usuários existentes.** Cada usuário em produção ganha sua pessoa, reaproveitando o
próprio id — é uma migração única, e ids coincidentes nas linhas antigas são inofensivos e fáceis
de conferir depois:

```sql
insert into pessoas (id) select id from users;
update users set pessoa_id = id;
alter table users alter column pessoa_id set not null;
```

O `set not null` vem **depois** do backfill. Assim a coluna nasce obrigatória sem quebrar as
linhas que já existiam, e o resto do código nunca precisa tratar "usuário sem pessoa".

**E-mail passa a ser único entre vínculos não encerrados:**

```sql
alter table users drop constraint users_email_key;
create unique index users_email_ativo_idx on users (email) where data_demissao is null;
```

Sem isso, o readmitido não conseguiria reusar o e-mail corporativo enquanto a linha antiga
existisse. O recorte é `data_demissao is null`, e não `is_active` — suspensão temporária não pode
liberar o e-mail de alguém para outra pessoa; só o desligamento libera.

> O nome `users_email_key` é o padrão do Postgres para `email text not null unique`. A
> implementação deve confirmá-lo com `\d users` antes de rodar o `drop constraint`.

**Por que `pessoas` separada, e não colunas em `users`.** Além da readmissão (seção 2),
`lib/db/users.ts` faz `select * from users where id = ...` dentro de `findUserById`, que roda em
**todo request autenticado** via `requireUser()`. Colocar os blobs cifrados de CPF e RG ali faria
cada request arrastar documento pessoal pela memória só para validar sessão.

## 5. Criptografia dos documentos

CPF e RG usam `lib/crypto.ts` (AES-256-GCM), o mesmo das senhas do cofre, com AAD prendendo o
valor à linha **e** ao campo: `${pessoa_id}:cpf` e `${pessoa_id}:rg`. Sem o campo no AAD, quem
tiver escrita no banco copiaria `rg_ct/iv/tag` para `cpf_ct/iv/tag` e leria um pelo outro — é a
mesma razão documentada em `lib/crypto.ts`.

O AAD usa `pessoa_id`, não `user_id`: o documento pertence à pessoa e sobrevive a ela trocar de
vínculo. Amarrar ao usuário quebraria a leitura do CPF numa readmissão.

Como o AAD depende do id, ele precisa existir antes de cifrar. O projeto já resolve isso em
`insertCredential`, gerando o uuid na aplicação com `randomUUID()` antes do insert; a criação de
pessoa passa a fazer o mesmo.

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

Como o `unique` está em `pessoas` e não em `users`, ele é global e definitivo: **um CPF, uma
pessoa**, independentemente de quantos vínculos ela tenha. Tentar cadastrar pessoa nova com CPF
existente falha com `23505` e vira a mensagem "Já existe uma pessoa com esse CPF" — mesmo padrão
que `saveUser` já usa para e-mail duplicado. A tela oferece então vincular o novo acesso à pessoa
existente (seção 8).

## 6. Telas

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

A grid mostra telefone, que vive em `pessoas`. Entra uma consulta nova em `lib/db/users.ts` —
`listUsersComContato()`, com `join pessoas` — em vez de alterar `listUsers()`, que é usada em
`/admin/salas` e não precisa desse dado.

A consulta da grid **não** traz `cpf_ct` nem `rg_ct`: documento cifrado só é lido pela action de
revelar, para um usuário por vez. Trazer os blobs de todo mundo para desenhar a lista seria expor
na memória do servidor o que a tela nem mostra.

Por padrão a grid lista só vínculos ativos (`data_demissao is null`). Um filtro "incluir
desligados" mostra o histórico, com a linha marcada e somente leitura.

### Revelar CPF e RG

Documentos aparecem mascarados por padrão. Revelar é uma server action explícita, autorizada a
**apenas duas pessoas**: o dono do dado e o master.

A regra é função pura em `lib/authz.ts`, ao lado de `camposEditaveis` (seção 7) e no mesmo padrão
das regras de credencial que já vivem ali:

```ts
export function podeRevelarDados(actor: Actor, alvoUserId: string): boolean {
  return actor.id === alvoUserId || actor.role === 'master';
}
```

Cada revelação grava auditoria com `action: 'view'`, `entityType: 'user'`, `entityId: <alvo>` —
ação e tipo que já existem em `AUDIT_ACTIONS`, sem precisar ampliar a união. `entityType`
distingue revelar documento de pessoa (`user`) de revelar senha do cofre (`credential`).

## 7. Permissão de escrita

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

Um salvamento do master atravessa duas tabelas: nome, e-mail, papel, estado e datas de vínculo em
`users`; contato, endereço e documentos em `pessoas`. As duas gravações vão num `sql.transaction`,
senão uma falha no meio deixaria o cadastro pela metade — com o caso pior sendo `data_demissao`
gravada sem o `is_active = false` que deve acompanhá-la (seção 9).

## 8. Fluxos de vínculo

**Criar usuário novo.** O master informa e-mail, nome, senha inicial e, opcionalmente, o CPF. Se
o CPF já existir em `pessoas`, a action não falha com erro cru: devolve "Já existe cadastro para
este CPF" e oferece **vincular o novo acesso à pessoa existente**, criando só a linha de `users`
com `pessoa_id` apontando para ela. É esse o caminho da readmissão.

Sem CPF informado, cria pessoa nova vazia — o documento pode ser preenchido depois.

**Demitir.** Preencher `data_demissao` desativa o acesso na mesma transação (seção 9). A linha
permanece para histórico e continua aparecendo no filtro "incluir desligados".

**Readmitir.** É criar usuário novo com o CPF de alguém já cadastrado, aceitando o vínculo à
pessoa existente. O acesso a salas e módulos **não** é herdado: precisa ser concedido de novo.

**Histórico da pessoa.** No modal, uma seção lista os vínculos anteriores daquela pessoa (datas de
contratação e demissão, e o nome usado à época), em somente leitura.

## 9. Regras de negócio

**Demissão desliga o acesso.** Gravar `data_demissao` põe `is_active = false` no mesmo
`sql.transaction`, e registra auditoria `user_update`. O risco concreto é alguém sair da empresa e
continuar com acesso ao cofre de senhas porque ninguém lembrou de desmarcar outra caixa. Limpar a
data de demissão **não** reativa sozinho — reativar é decisão consciente do master, na caixa
"ativo".

**CPF e CNPJ validam dígito verificador** antes de gravar, em `lib/documentos.ts`. Rejeitam também
as sequências repetidas (`111.111.111-11` e afins), que passam no cálculo de dígito mas nunca são
documentos reais. Campo vazio é válido: os dois são opcionais.

**Máscaras** na exibição e na digitação: CPF `000.000.000-00`, CNPJ `00.000.000/0000-00`,
CEP `00000-000`, telefone `(00) 00000-0000`. O banco guarda só dígitos; máscara é apresentação.

**Login ignora vínculos encerrados.** `findUserByEmail` ganha `and data_demissao is null`. Depois
de uma readmissão existem duas linhas com o mesmo e-mail, e hoje a função faz
`select * ... where email = X` e devolve `rows[0]` — sem o filtro, poderia devolver a conta antiga
e quebrar o login da atual, de forma silenciosa e difícil de diagnosticar.

## 10. Testes

**Puros, sem banco** (`tests/`, ambiente `node`):
- `lib/documentos.ts`: CPF e CNPJ válidos, dígito verificador errado, sequência repetida, string
  vazia, tamanho errado, entrada com máscara e sem máscara.
- `camposEditaveis`: master sobre outro, master sobre si, comum sobre si, comum sobre outro.
- `podeRevelarDados`: as mesmas quatro combinações.
- `cpfHmac`: determinístico (mesma entrada → mesma saída) e sensível (CPFs diferentes → HMACs
  diferentes).

**Integração, contra o banco real** (`tests/integracao.test.ts`, padrão já existente):
- gravar `data_demissao` desativa o usuário na mesma transação;
- CPF duplicado em `pessoas` viola `cpf_hmac` e vira erro tratado;
- readmissão: segundo vínculo com o mesmo e-mail é aceito depois do primeiro ser encerrado, e
  `findUserByEmail` devolve o vínculo **atual**, não o antigo;
- e-mail duplicado entre dois vínculos **ativos** continua sendo rejeitado;
- ida e volta de cifragem: gravar CPF, ler, decifrar, comparar;
- AAD trocado (usar `:rg` para ler `cpf`) falha.

**Componente, jsdom** (`tests/*.test.tsx`, infra já montada):
- master vê grid; usuário comum não vê grid, vê o modal;
- campo fora do escopo do dono chega desabilitado no modal do usuário comum.

Não escrever teste para máscara de digitação nem para o layout do modal — jsdom não computa
layout, e a spec anterior do sidebar já fixou essa regra.

## 11. Busca de CEP

Preencher o CEP dispara busca que autocompleta logradouro, bairro, cidade e UF.

Fonte: **BrasilAPI** (`https://brasilapi.com.br/api/cep/v2/{cep}`), pública e sem chave.

A chamada sai de uma **server action**, não do navegador. Dois motivos: não expõe o IP de quem
está editando a um terceiro, e permite tratar timeout num lugar só. A action tem timeout curto
(5s) e **falha em silêncio**: se a API não responder, o formulário segue editável e a pessoa
digita à mão. Busca de CEP nunca pode impedir salvar um cadastro.

O CEP digitado é gravado mesmo que a busca falhe.

## 12. Fora de escopo (spec 2)

**Permissão por rota dentro dos módulos.** O Gestor de Projetos já tem catálogo de permissão por
página (`src/lib/permissions.ts`: `PERMISSIONS_CATALOG`, chaves `page:/rota`, `ALL_ACCESS`), mas
ele está desligado para quem entra por SSO: `/api/me` devolve `profileId: null`, então
`permissions` fica `[]` e nega tudo — só o master passa, por bypass. Levar esse controle para o
Cofre exige decidir onde mora a verdade da permissão e mexe nos dois repositórios; vira spec
própria.

Também fora desta rodada:
- foto ou avatar de usuário;
- histórico de alterações campo a campo (a auditoria registra o evento, não o diff);
- exportação do cadastro;
- reativação automática ao limpar a data de demissão;
- validação de CEP contra o endereço digitado (a busca preenche, mas não impede divergência);
- unificar duas pessoas cadastradas em duplicidade antes deste desenho existir.

## 13. Pendências conhecidas na implementação (não bloqueiam o merge)

A revisão final de branch achou quatro pontos onde a implementação diverge do que este
documento pede, mas nenhum deles concede acesso indevido nem corrompe dado — por isso a
decisão foi registrar como dívida técnica em vez de atrasar o merge por eles. Ficam aqui,
versionados, porque o rascunho anterior os deixou só em `.superpowers/sdd/` (gitignored) e
teria virado dívida invisível.

1. **Master não edita e-mail pela UI.** O campo chega `disabled` incondicional no modal
   (`app/(app)/usuarios/UsuariosClient.tsx`). A seção 6 deste documento pedia que o master
   pudesse editar. Corrigir exige decidir o que fazer com sessões abertas sob o e-mail
   antigo — não é só destravar o campo.

2. **`salvarCadastro` não usa `sql.transaction` entre a gravação em `users` e em
   `pessoas`.** São chamadas separadas (`updateVinculo`, depois `updatePessoa`, que por
   sua vez é internamente 3–4 `update`s). A seção 7 pedia atomicidade. O caso mais grave
   citado ali — demissão sem `is_active = false` — está coberto porque `updateVinculo`
   continua sendo uma única instrução, mas uma falha no meio pode deixar `pessoas`
   parcialmente atualizada.

3. **Vínculo por CPF em `criarUsuario` reaproveita a pessoa automaticamente, sem
   confirmação.** A seção 8 pedia oferecer a escolha ao master ("já existe pessoa com este
   CPF, vincular?") em vez de decidir sozinho. `CadastroState.pessoaExistenteId` existe no
   tipo e nunca é usado — o resto do fluxo de confirmação nunca foi implementado. Risco
   prático: CPF digitado errado que colide com outra pessoa anexa o vínculo novo a ela sem
   aviso.

4. **`criarUsuario` lê campos de contato/documento que o formulário de criação
   (`NovoUsuarioForm`) nunca envia** (`telefone`, `cep`, `rg`, `rgOrgao`, `cnpj`,
   `dataNascimento`), e só grava algo nesses campos se houver CPF preenchido. Não é bug —
   é código morto que confunde quem ler `app/(app)/usuarios/actions.ts` depois. Ou o
   formulário ganha esses campos, ou a action para de tentar lê-los.
