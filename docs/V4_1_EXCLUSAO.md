# JAQUE PRATAS V4.1 — exclusão segura de cadastros

## Entrega e comportamento

Implementação local concluída e validada com fixtures isoladas. Clientes e produtos agora oferecem Editar, Arquivar/Reativar e ação de exclusão. A exclusão abre um modal nominal, consulta elegibilidade no banco e exige confirmação explícita de irreversibilidade. Quando bloqueada, apresenta os motivos e oferece arquivamento se o cadastro ainda estiver ativo.

**Nenhum cadastro real foi excluído. Nenhuma migração foi aplicada no Supabase remoto ou em produção. Não houve push ou publicação.** A versão precisa ser instalada/homologada em Supabase autorizado antes de considerar o ambiente real validado.

| Cadastro | Exclusão definitiva permitida | Bloqueios e alternativa |
| --- | --- | --- |
| Cliente | Sem vendas, condicionais, outras FKs ou auditoria de alterações relevantes | Preservar referências e oferecer Arquivar. Arquivados continuam no histórico e não entram em novas operações |
| Peça | Estoque zero, sem vendas/condicionais/movimentos/fotos vinculadas/outras referências | Arquivar em vez de apagar; peças arquivadas saem do catálogo e das novas opções |

A auditoria automática INSERT do cadastro de cliente não impede, sozinha, a exclusão de um cadastro nunca usado. Ela não é removida: customer_audit_subjects preserva a identidade permanente, e a FK da auditoria é redirecionada a essa identidade. Auditoria UPDATE conta como histórico relevante e bloqueia exclusão. Todos os snapshots e autores/datas permanecem intactos. Não é uma funcionalidade de eliminação de dados pessoais.

Reativar cliente restaura sua elegibilidade. Reativar peça mantém o comportamento V4.0: o cadastro volta sem arquivamento, mas permanece inativo até escolher Ativar. Produtos arquivados não são vendidos por novas operações, nem por uma nova compra derivada de condicional; retornos físicos antigos continuam disponíveis.

## Migração e segurança

Migração incremental: `supabase/migrations/20261029010000_exclusao_segura_v41.sql`, aplicada após fundação, B e operações V4.0. Migrações anteriores não foram reescritas. A mudança cria a tabela de identidades históricas, preserva/copía apenas identificadores para ela e altera a FK da auditoria, sem apagar/reescrever as linhas de clientes ou auditoria existentes. O ensaio sobre base V4.0 populada foi executado e comparou os registros antes/depois.

admin_execute mantém a assinatura pública e ganha comandos customer_delete, product_delete, customer_archive e product_archive. O corpo anterior foi renomeado para admin_execute_v40 e perdeu EXECUTE pela API, mas continua sendo delegado para todos os demais fluxos, inclusive cancelamento recursivo. admin_deletion_info é uma leitura administrativa para o modal; a UI nunca decide sozinha o que pode ser apagado.

As escritas verificam auth.uid/is_admin, usam o mesmo advisory lock transacional, FOR UPDATE no cadastro, revalidação das dependências, confirmação do nome atual e ledger idempotente. Guardas BEFORE DELETE impedem exclusão fora da operação protegida. Não há DELETE direto para anon/authenticated, inclusive administradora pela API. Uma falha depois do DELETE e antes do ledger reverte a transação inteira.

O helper privado percorre FKs, inclusive desconhecidas/futuras. Uma referência que tentaria apagar em cascata também é detectada e bloqueada; referências compostas exigem revisão e bloqueiam conservadoramente. RLS e grants privados cobrem a nova tabela de identidades. Não se utiliza ON DELETE CASCADE como solução de integridade.

## Imagens e limites conservadores

A operação de exclusão não remove objetos do Supabase Storage nem registros de fotos associados. Fotos vinculadas bloqueiam a exclusão da peça, mesmo sem venda. Isso evita perder imagens ainda referenciadas/compartilhadas e não finge uma transação atômica entre banco e Storage. O modal informa esse bloqueio e permite arquivar. Resolver imagens deve ocorrer pelo fluxo próprio e com verificação das referências; não há limpeza automática de arquivos órfãos nesta funcionalidade.

Auditoria de UPDATE e referências compostas são bloqueios conservadores adicionais. Não foi inventada uma política que descarte esses históricos para liberar exclusão. A elegibilidade pode mudar entre abrir e confirmar o modal; o backend sempre repete a avaliação. Nome alterado exige nova conferência, e não apaga silenciosamente um cadastro renomeado.

## Testes executados no projeto final

| Comando | Resultado real |
| --- | --- |
| npm test | **44 passaram**, zero falhas |
| npm run test:db | **37 passaram**, zero falhas; 1 caso navegador excluído somente nessa chamada |
| npm run test:browser | **1 caso completo passou**, zero falhas; inclui os fluxos anteriores e exclusão/arquivamento V4.1 |
| npm run build | TypeScript passou; Vite 7.3.7 passou, 110 módulos |

Total: **82 casos aprovados**, contando o navegador uma única vez. Nenhum teste anterior foi removido. Não houve novas dependências ou alteração de lockfile nesta V4.1. Logs estão em docs/evidence-v4.1. Capturas docs/browser-v41-delete.png e browser-v41-blocked.png usam somente dados fictícios e foram inspecionadas visualmente.

Cobertura dos requisitos:

1. Cliente sem histórico: exclusão permitida; auditoria/identidade preservadas.
2. Cliente com vendas/condicionais/auditoria UPDATE: exclusão bloqueada.
3. Arquivar/reativar cliente sem sobrescrever nome/telefone/notas; bloqueio de nova entrega enquanto arquivado.
4. Peça sem histórico e com estoque zero: exclusão permitida.
5. Peça com venda: bloqueio e preservação dos snapshots, recebimentos e saldos.
6. Peça em condicional: bloqueio durante pendência e depois do encerramento.
7. Peça com movimentos mesmo após saldo zerar: bloqueio; fotos vinculadas também preservadas.
8. Visitante/login comum e DELETE direto: bloqueados; helpers/corpo V4.0 não têm EXECUTE pela API.
9. Mesma chave de exclusão: mesmo resultado mesmo depois de o cadastro deixar de existir; payload divergente rejeitado.
10. Catálogo, revisão, Pix, estoque, vendas, pagamentos, cancelamentos e CSV continuam passando no fluxo de navegador/regressão.

Testes adicionais: FK desconhecida com CASCADE não perde dados; rollback depois do DELETE quando ledger falha; concorrência de exclusão e entrega nas duas ordens; alteração do nome após a consulta prévia; script único SQL Editor; migração de uma base V4.0 populada preservando cadastros/auditorias.

PostgreSQL dos testes é nativo/real e descartável. Auth/Storage são contratos de fixture; Chromium usa transporte/Auth controlados para encaminhar RPCs a esse banco. **Isso não comprova PostgREST, Auth/JWT ou Storage reais do Supabase.** Nenhuma exclusão de objeto remoto foi ensaiada ou executada por esta operação.

## Aplicação em ambiente autorizado

1. Fazer backup de banco/Storage e confirmar identificação do projeto exclusivamente de testes.
2. Executar verify_installation.sql e conferir V4.0/schema/histórico. Não reaplicar fundação, B ou operações se já instaladas.
3. Aplicar somente a nova migração V4.1 sobre base V4.0 compatível. Em divergências, preparar reconciliação; não usar reset, DROP CASCADE ou reaplicar indiscriminadamente.
4. Executar **todo** supabase/tests_v41_sql_editor.sql. O script usa cadastros fictícios, testa exclusão/bloqueios/replay/auditoria/arquivamento/visitante e desfaz as fixtures; foi validado no PostgreSQL isolado, mas ainda não no Supabase completo.
5. Homologar os modais e permissões via API com tokens anon, comum e admin no Supabase de testes. Não usar cadastros reais para ensaiar exclusão. Confirmar que imagens não foram removidas e histórico continua disponível.

Não aplicar em produção nem excluir registros existentes sem autorização específica. Código novo sem a migração mostra erro na verificação de elegibilidade e não recorre a DELETE direto.

## Arquivos alterados e backup

O manifesto CHANGESET_V4_1.json lista a entrega e o backup prévio, validado em bytes. Foram atualizados regras, arquitetura, progresso, decisões, roteiro de testes, implantação e README. O prompt original V4.1 está preservado em CODEX_PROMPT_JAQUE_PRATAS_V4_1.md.


Arquivos transferidos:

- `CODEX_PROMPT_JAQUE_PRATAS_V4_1.md`
- `README.md`
- `AGENTS.md`
- `supabase/tests_v41_sql_editor.sql`
- `supabase/verify_installation.sql`
- `docs/browser-v41-blocked.png`
- `docs/browser-v41-delete.png`
- `docs/TEST_PLAN.md`
- `docs/RELATORIO_TECNICO.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/DEPLOYMENT.md`
- `docs/DECISIONS.md`
- `docs/BUSINESS_RULES.md`
- `docs/browser-mobile.png`
- `docs/ARCHITECTURE.md`
- `src/styles/admin.css`
- `src/admin/RecordActionDialog.tsx`
- `src/admin/services.ts`
- `src/admin/ProductsPage.tsx`
- `src/admin/ManagementPage.tsx`
- `supabase/migrations/20261029010000_exclusao_segura_v41.sql`
- `tests/database/management.test.mjs`
