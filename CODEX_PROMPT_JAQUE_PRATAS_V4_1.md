# JAQUE PRATAS V4.1 — Exclusão de clientes e produtos

Atue como engenheiro de software sênior especializado em React, TypeScript, Supabase, PostgreSQL, segurança RLS e sistemas de gestão comercial.

Sua missão é implementar a possibilidade de excluir clientes e produtos (peças) no painel administrativo da JAQUE PRATAS, preservando a integridade do banco de dados e todas as funcionalidades existentes.

## 1. Preparação obrigatória

Antes de modificar qualquer arquivo:

1. Leia integralmente `PROJECT_CONTEXT.md`, `AGENTS.md`, `docs/BUSINESS_RULES.md`, `docs/ARCHITECTURE.md` e `docs/PROJECT_PROGRESS.md`, caso existam.
2. Inspecione a implementação atual de clientes, produtos, estoque, condicionais, vendas e auditoria.
3. Analise as migrations e as políticas RLS existentes.
4. Preserve a identidade visual, os componentes e o comportamento da V4.0.

Não recrie módulos existentes nem altere funcionalidades sem necessidade.

## 2. Exclusão de clientes

Adicionar a ação **Excluir cliente** na interface de gerenciamento de clientes.

Regras:

- Um cliente sem vínculos comerciais ou históricos relevantes poderá ser excluído definitivamente.
- Um cliente que possua vendas, condicionais, recebimentos ou outros registros que dependam dele não poderá ser excluído definitivamente.
- Nesse caso, oferecer **Arquivar cliente**, preservando os dados necessários ao histórico.
- Clientes arquivados não devem aparecer como opção para novas vendas ou condicionais.
- Clientes arquivados devem continuar acessíveis em históricos e consultas administrativas.
- Se houver registros de auditoria ou outras referências, não apagá-los em cascata. Avaliar as dependências antes de permitir a exclusão.
- Exibir uma confirmação clara antes de excluir.

## 3. Exclusão de produtos

Adicionar a ação **Excluir peça** na interface administrativa de produtos.

Regras:

- Produtos sem vendas, condicionais, movimentações de estoque ou outros históricos relevantes poderão ser excluídos definitivamente.
- Produtos com histórico comercial deverão ser arquivados, não excluídos fisicamente.
- Não permitir exclusão definitiva de produtos presentes em condicionais pendentes.
- Não permitir exclusão definitiva que comprometa vendas anteriores ou seus snapshots.
- Produtos arquivados devem desaparecer do catálogo público e das opções de novas operações.
- Manter o histórico financeiro, as referências e os movimentos de estoque.
- Verificar as dependências das imagens no Supabase Storage. Não excluir arquivos compartilhados ou ainda referenciados.
- Não apagar registros relacionados usando `ON DELETE CASCADE` como solução para conflitos de integridade.

## 4. Interface

Adicionar as ações nos locais adequados, reutilizando o padrão visual da aplicação.

Para clientes e produtos:

- **Editar**
- **Arquivar / Reativar**
- **Excluir definitivamente**, quando permitido

A exclusão definitiva deve exigir confirmação em um modal, informando o nome do registro e que a operação não poderá ser desfeita.

Se a exclusão estiver bloqueada por dependências, apresentar uma explicação objetiva e oferecer o arquivamento quando aplicável.

Não utilizar confirmações genéricas pouco informativas.

## 5. Backend e segurança

Implementar as exclusões por meio de operações administrativas autorizadas no PostgreSQL, preferencialmente integradas à arquitetura transacional existente (`admin_execute` ou mecanismo equivalente).

Requisitos:

- Verificar `auth.uid()` e a autorização administrativa no banco.
- Respeitar RLS, grants e políticas existentes.
- Não conceder exclusão direta ao público ou a usuários comuns.
- Verificar dependências dentro da transação, evitando condições de corrida.
- Preservar idempotência e proteção contra operações duplicadas.
- Não permitir que a interface decida sozinha se um registro pode ser excluído.
- Garantir rollback integral em caso de falha.
- Evitar alterações destrutivas no schema existente.
- Criar uma migration incremental para a V4.1.

A exclusão deve ser recusada pelo banco sempre que houver risco de perda de histórico ou violação de integridade referencial.

## 6. Testes obrigatórios

Adicionar testes para:

1. Excluir cliente sem histórico.
2. Bloquear exclusão de cliente com histórico.
3. Arquivar e reativar cliente.
4. Excluir produto sem histórico.
5. Bloquear exclusão de produto com venda.
6. Bloquear exclusão de produto com condicional.
7. Bloquear exclusão de produto com histórico de estoque relevante.
8. Impedir exclusão por usuário não autorizado.
9. Repetir uma operação de exclusão com a mesma chave idempotente.
10. Confirmar que catálogo, estoque, vendas e relatórios continuam funcionando.

Executar os testes existentes e `npm run build`.

## 7. Documentação e entrega

Atualizar os arquivos de documentação pertinentes, incluindo `docs/BUSINESS_RULES.md` e `docs/PROJECT_PROGRESS.md`.

Ao concluir, apresentar:

- Arquivos alterados.
- Migration criada.
- Comportamento de exclusão e arquivamento.
- Testes executados e resultados.
- Possíveis limitações.

Implemente a V4.1 completa em uma única execução, sem solicitar aprovação entre etapas.

Não aplique migrations em produção, não exclua dados existentes, não faça push e não publique o site sem autorização explícita.