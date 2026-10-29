# Missão integral — 29/10/2026

Autorização: implementação de todas as fases numa execução contínua, sem pausas entre marcos. Não alterar dados reais, aplicar em produção, publicar, fazer push ou alterar DNS. Documentos lidos integralmente. A fonte de trabalho é o projeto ativo no Disco-Movel, reaproveitando o backup B compatível com o schema já aplicado pelo proprietário no projeto Supabase de teste.

## Fase 0 — auditoria e linha de base

- Projeto ativo no Marco A; sem Git reconhecido, Docker ou Supabase CLI. Nenhum reset/repositório/branch fictícia.
- Código/README/scripts e SQL revisados. Hashes do estado inicial registrados antes de editar. Cópia isolada de trabalho sem arquivos de ambiente reais.
- Linha de base: 42 testes passaram e build Vite 5 passou. Fundação SQL e código público preservados.
- Audit inicial: 4 alertas (1 high, 3 moderate) em Vite/esbuild e React Router.
- Recuperados do backup a migração B original, testes SQL/PostgreSQL e a dependência de desenvolvimento embedded-postgres. Nenhum dado remoto lido ou modificado.

## Fase 1 — preços/WhatsApp

- Marco A mantido: cálculo Pix por unidade, promoção cumulativa, valores/totais na vitrine/revisão/mensagem e revalidação de disponibilidade. Sem escrita pública.
- Testes anteriores mantidos. O caso Chromium exercita catálogo e revisão antes dos fluxos administrativos.

## Fase 2 — modelagem e atomicidade

- B recuperada sem alterar bytes; nova migração 20261029000000_operacoes.sql cria RPCs admin_execute/admin_snapshot, estende tipos de movimentos, snapshots e bloqueia edição direta de estoque.
- Guardas administrativas, grants explícitos, search_path vazio, lock transacional, idempotência com validação de autor/operação/payload. Histórico imutável e geração única de movimentos.
- Testes nativos passaram para RPCs autorizadas/não autorizadas, replay, rollback, concorrência pela última unidade, constraints e snapshots.

## Fases 3–5 — estoque, clientes, condicionais, vendas e recebimentos

- Novas telas reais em /admin/estoque, /admin/clientes, /admin/condicionais, /admin/vendas, /admin/recebimentos; dashboard substituído. Serviço usa Supabase RPC, sem persistência fictícia no produto.
- Cadastro/edição/arquivamento/auditoria e histórico da cliente; estoque com pesquisa, baixo estoque, entradas/ajustes/perdas e movimentos.
- Preparação/entrega física e retorno/perda/compra parciais, correção de evento e encerramento derivado das pendências. Venda de condicional sem segunda baixa.
- Venda direta/condicional, snapshots de nomes/descrição/categoria/preços, crédito explícito da loja, recebimentos parciais, quitação, estornos e cancelamento/devolução parcial/integral com confirmações físicas/financeiras.
- Formulários bloqueiam repetição durante submissão e preservam chave de tentativa em erro de rede enquanto os dados não mudam. Erros são exibidos no diálogo.

## Fases 6–7 — relatórios, UX e segurança

- /admin/relatorios e dashboard com agregações de dados efetivos, datas/filtros, vendido/recebido/estornado/saldo separados; CSV de vendas, recebimentos, estornos e estoque com neutralização de fórmulas. Sem lucro fictício.
- Menu móvel rolável; teste 390 px sem overflow. Captura de fixture em docs/browser-mobile.png.
- Atualização controlada de Vite para 7.3.7, plugin React 5.2.0 e React Router DOM 7.18.5; React 18 preservado. Node 24+ e .nvmrc. Audit após atualização: zero vulnerabilidades reportadas. Sem audit fix --force.
- Documentação de arquitetura/regras/decisões/testes/deploy, backup/restauração banco+Storage e verificações de instalação. Script de SQL Editor sem coletor temporário, testado nativamente com rollback.

## Verificações e limites atuais

A rodada final e a entrega ao projeto original serão registradas abaixo. Resultados intermediários: 44 testes unitários/estáticos passaram; 21 casos PostgreSQL passaram, 1 caso navegador excluído nessa chamada; caso de navegador executado separadamente passou; TypeScript e build Vite 7 passaram; audit zero. Os primeiros testes detectaram seleção de label exata no navegador; seletor corrigido, fluxo integral reexecutado. Nenhuma falha de negócio foi escondida removendo testes.

PostgreSQL é real, com contratos mínimos Auth/Storage. Chromium encaminha RPCs ao PostgreSQL através de transporte controlado e usa sessão fictícia. Não equivale a teste contra Supabase completo. Não foram aplicadas migrações remotas, executados envios WhatsApp, restaurados backups de banco/Storage, publicados sites ou alterados DNS. O Supabase de testes pode continuar somente com B até aplicação autorizada da nova migração.


## Rodada final e entrega no caminho definitivo

- Arquivos transferidos com verificação de hashes para não sobrescrever mudanças posteriores do usuário; manifesto em CHANGESET.json. Backup de arquivos anteriores em `../../backups/antes_missao_integral_20261029.zip` (relativo à pasta docs), verificado em bytes. Sem arquivos de ambiente.
- Instalação limpa conforme lockfile no projeto final: npm ci --offline --ignore-scripts; postinstall Linux x64 inspecionado foi executado explicitamente via npm rebuild.
- **npm test: 44/44 passaram. test:db: 22 passaram, 1 navegador ignorado somente nessa chamada. test:browser: 1/1 passou. Total 67 casos aprovados, zero falhas.** TypeScript e build Vite 7.3.7 passaram (109 módulos). Audit final: zero vulnerabilidades reportadas.
- Evidências de execução em docs/evidence; captura mobile final inspecionada visualmente. Nome histórico desconhecido não é inventado; venda zero preserva estado válido por quantidade restante.
- Fundação SQL e modelo B recuperado conferidos intactos; regra Pix pública e logo preservadas. Banco remoto não recebeu nova migração, dados reais não foram alterados e site não foi publicado. Homologação Supabase completo e restore/deploy seguem pendentes conforme RELATORIO_TECNICO.md.

## V4.1 — exclusão segura (29/10/2026)

Prompt anexado lido integralmente e salvo em CODEX_PROMPT_JAQUE_PRATAS_V4_1.md. Contexto, instruções, regras, arquitetura, progresso e código/migrações relevantes inspecionados. Sem Git reconhecido; alterações preparadas em cópia isolada, sem variáveis reais.

Implementada migração incremental 20261029010000_exclusao_segura_v41.sql, sem reescrever as anteriores. Identidade histórica separada do cadastro para preservar auditoria automática de criação; auditoria de alterações/comércio bloqueia exclusão. Dependências de peça e FKs desconhecidas bloqueiam; nenhum Storage é apagado. RPCs autorizadas, transação, locks, guardas e replay idempotente. Corpo V4.0 privado preservado e delegado pelo wrapper.

Clientes/produtos recebem modal compartilhado de exclusão, explicação de bloqueios, alternativa de arquivamento e reativação explícita. Cadastro/nome são verificados novamente no backend. Cliente/peça arquivados não são oferecidos em novas operações; retornos antigos seguem possíveis. Reativação de peça mantém estado inativo até Ativar.

Testes nativos e Chromium ampliados. Primeira rodada: 33 casos PostgreSQL aprovados; browser regressão + modais aprovados; 44 unitários/estáticos e build aprovados. Rodada final incluindo concorrência específica será registrada no relatório V4.1. Nenhuma migração remota, dado existente real, push ou publicação foi realizado.


### V4.1 — rodada final e entrega

- Entrega no projeto definitivo com comparação de hashes para preservar mudanças do usuário. Backup validado em `../../backups/antes_v41_20261029.zip`, relativo à pasta docs. Manifesto CHANGESET_V4_1.json.
- **44 unitários/estáticos + 37 PostgreSQL + 1 fluxo Chromium aprovados = 82 casos, zero falhas.** O navegador é ignorado em test:db e executado separadamente em test:browser. TypeScript e build passaram (Vite 7.3.7, 110 módulos).
- Migração sobre base V4.0 populada preservou cadastros e auditorias; exclusão concorrente/entrega testada nas duas ordens, além de rollback e dependências desconhecidas. Capturas dos modais inspecionadas visualmente.
- Relatório V4_1_EXCLUSAO.md, evidências em evidence-v4.1; script tests_v41_sql_editor.sql pronto para homologação em Supabase exclusivo de testes. Não foi aplicado ao remoto, dados reais não foram excluídos e não houve push/publicação.
