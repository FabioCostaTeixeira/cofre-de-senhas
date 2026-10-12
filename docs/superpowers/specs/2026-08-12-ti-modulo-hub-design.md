# Módulo TI (Epics, Features e User Stories) — Documentação e Atualizações

## Visão Geral
O módulo de TI foi implementado como uma nova seção dentro do Cofre de Senhas, servindo como hub para gestão ágil de projetos técnicos, divididos hierarquicamente em:
1. **Epics (Projetos de TI):** Grandes iniciativas com status, prioridade, prazos e barra de progresso calculada automaticamente a partir das tarefas filhas.
2. **Features (Tarefas):** Unidades de trabalho dentro do projeto, com pesos customizáveis que somam 100% e redistribuem automaticamente o restante entre os irmãos.
3. **User Stories (Atividades):** Requisitos detalhados dentro de cada feature, com suporte a fluxos em **Grid (Tabela)** e **Kanban por Status** (Roadmap, A Fazer, Em Progresso, Homologação, Bloqueada, Concluído).

## Funcionalidades Adicionadas
- **Duplicação de Projetos (Epics):**
  - Ícone de cópia localizado no canto superior direito de cada card de projeto.
  - Duplica de forma atômica (via transação de banco com novos UUIDs) o projeto, todas as suas features e todas as user stories.
  - **Regra de Status:** Todos os elementos copiados reiniciam automaticamente com o status **Roadmap**, isolando histórico anterior.
- **Edição Completa de Projetos:**
  - Botão de edição nos cards de projetos, abrindo modal com os dados atuais prontos para alteração e salvamento.
- **Reatribuição de Tarefa Pai (User Story):**
  - Ao editar uma User Story, agora é possível selecionar qualquer outra tarefa/feature existente no sistema como novo pai através de um campo select. O backend valida a operação e rebalanceia os pesos dos irmãos nos pais antigo e novo.
- **Fila de Prioridade Vertical (Kanban):**
  - Ordenação personalizada baseada no campo `ordem` e drag-and-drop / atalhos de posição nas colunas do Kanban.
- **Barra de Progresso Ponderada:**
  - Cálculo recursivo no banco de dados medindo o andamento ponderado das tarefas com base no peso de suas user stories concluídas.
