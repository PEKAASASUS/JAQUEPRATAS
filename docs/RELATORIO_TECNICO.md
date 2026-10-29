# Relatório técnico — JAQUE PRATAS — missão integral de 29/10/2026

> Registro da entrega V4.0. A evolução posterior de exclusão segura está em V4_1_EXCLUSAO.md e na seção V4.1 de PROJECT_PROGRESS.md.

## 1. Resultado e estado de entrega

Implementação local dos módulos solicitados entregue no projeto `jackpratas/`, no disco Disco-Movel. A base do Marco A foi preservada e a modelagem B foi recuperada do backup sem reescrever o SQL que o proprietário já aplicou em seu Supabase de testes. Não houve pausas de aprovação entre marcos.

**Não está homologado em Supabase completo nem implantado em produção.** Nenhuma migração remota, alteração de dados reais, promoção de administrador real, push, deploy ou DNS foi executado nesta missão. A gestão requer aplicar a migração de operações em um alvo autorizado antes de funcionar nesse alvo. Código do produto usa Supabase real; os substitutos de transporte/Auth existem somente nos testes.

## 2. Funcionalidades implementadas

| Área | Implementação entregue | Validação efetiva |
| --- | --- | --- |
| Catálogo e WhatsApp | Preservados catálogo/filtros/detalhes/imagens/seleção/revisão; Pix 10% acumulativo; revalidação antes da mensagem; sem escrita pública | 44 testes unitários/estáticos no conjunto; fluxo Chromium de catálogo/revisão |
| Clientes | Cadastro, pesquisa, edição, arquivamento/reativação, auditoria e histórico de vendas/condicionais/recebimentos | RPC PostgreSQL e fluxo Chromium de cadastro |
| Estoque | Disponível/em condicional/físico, pesquisa, baixo estoque, entrada/ajuste/perda com motivo, movimentos e eventos físicos | PostgreSQL, disputa real pela última unidade e ajuste Chromium |
| Condicionais | Preparação de formulário, confirmação de entrega física, retorno/perda/compra parcial, correção de evento, pendência e encerramento derivado | Fluxo PostgreSQL completo e Chromium entrega/retorno/compra |
| Vendas | Direta e de condicional sem segunda baixa; snapshots de cliente/nome/descrição/categoria/preços/desconto; crédito explícito ou à vista | PostgreSQL, snapshots e venda à vista/condicional; Chromium |
| Recebimentos | Métodos Pix/cartão/dinheiro/transferência, parcial/quitação, saldo derivado, estornos com motivo e limites | PostgreSQL e Chromium quitação |
| Cancelamento/devolução | Reversão parcial por item ou integral atômica; confirmação de retorno físico e devolução financeira excedente; histórico preservado | PostgreSQL e Chromium cancelamento com estorno |
| Dashboard/relatórios | Indicadores efetivos de vendido/recebido/estornado/saldo, estoque/condicionais/devoluções, filtros e CSV seguro | Chromium e testes CSV/período |
| Segurança/UX | RLS, grants privados, RPCs autorizadas, replay idempotente, guardas de estoque, estados de erro/carregamento, formulário bloqueado em envio, mobile | PostgreSQL com papéis e Chromium com transporte/Auth de teste |

A confirmação de devolução financeira registra uma operação já realizada pela proprietária; o site não transfere dinheiro nem chama uma operadora. Não há juros/parcelas/repasse inventados, lucro fictício, pedido criado por WhatsApp, venda anônima ou persistência substituída por localStorage. Os limites conservadores e demais regras estão em BUSINESS_RULES.md.

## 3. Arquitetura e decisões

- React 18/TypeScript/Supabase e assets mantidos. Atualização de segurança controlada para Vite 7.3.7, plugin React 5.2.0 e React Router DOM 7.18.5; APIs declarativas das rotas preservadas. Node 24+.
- `admin_execute` é a fronteira transacional de escrita: autorização Auth/admin_users, lock de gestão, locks de produto, validação de regras no banco, registro de idempotência e todos os efeitos na mesma transação. Repetir mesma chave/operação/payload/autor retorna o mesmo resultado; reuso divergente é rejeitado.
- Uma única trigger gera stock_movements. Saída física baixa disponível; compra de condicional só consome pendência. Movimentos incluem motivo, autor e referência de requisição.
- Venda, recebimento, saldo e reversões são registros distintos. Dinheiro é decimal no banco; snapshots e totais são derivados pelo backend. Somatórios monetários de interface usam centavos.
- Todos os históricos de gestão são imutáveis; edição/arquivamento de cliente gera auditoria. Registros antigos sem snapshot novo não são preenchidos com informação atual inventada.
- Estado de condicional e venda é derivado de quantidades/eventos/saldos. Venda de valor zero continua válida e não é confundida com cancelamento.
- `admin_snapshot` fornece uma leitura privada coesa; não há view financeira pública. Não usa paginação e o lock de gestão é global: são decisões explícitas para a loja pequena, a reavaliar com volume elevado.

Detalhamento: ARCHITECTURE.md e DECISIONS.md.

## 4. Migrações e aplicação

- `20260101000000_fundacao.sql`: intacta; não reaplicar sobre fundação existente.
- `20261028000000_gestao_base.sql`: idêntica em bytes ao backup B; recuperada para compor a sequência histórica. Não reaplicar sobre tabelas B já existentes.
- `20261029000000_operacoes.sql`: nova migração incremental e transacional, com snapshots adicionais, tipos de movimentos, guardas e RPCs.

Banco vazio autorizado: fundação → B → operações. Banco do proprietário que já possui fundação e B compatíveis: **somente operações**. Antes, executar verify_installation.sql, comparar estrutura/histórico e ter backup do banco/Storage. Em schema parcial/divergente, preparar reconciliação; não usar reset ou DROP CASCADE.

Depois de aplicar no projeto exclusivamente de testes, executar integralmente `supabase/tests_full_sql_editor.sql`, que emite uma saída final única se todas as verificações passam e desfaz suas fixtures. Este script foi executado no PostgreSQL isolado, mas não no Supabase remoto. O roteiro exato está em DEPLOYMENT.md e TEST_PLAN.md.

## 5. Comandos e resultados reais no projeto final

| Comando | Resultado observado |
| --- | --- |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | Instalação limpa conforme lockfile: passou; 104 pacotes instalados |
| `npm rebuild @embedded-postgres/linux-x64 --foreground-scripts` | Postinstall previamente inspecionado/permissão explícita para hidratar bibliotecas: passou |
| `npm test` | **44 passaram; zero falhas; zero ignorados** |
| `npm run test:db` | **22 passaram; zero falhas; 1 caso navegador ignorado intencionalmente e executado pelo comando seguinte** |
| `npm run test:browser` | **1 caso de ponta a ponta passou; zero falhas**, Chromium + PostgreSQL nativo e transporte/Auth controlados |
| `npm run build` | TypeScript passou; Vite 7.3.7 passou, 109 módulos; JS ~474,10 kB e CSS ~15,47 kB |
| `npm audit --json` | **Zero vulnerabilidades reportadas**; audit inicial havia reportado quatro (uma high e três moderate) |

Total: **67 casos aprovados nos runners**, contando o navegador uma vez. Não é uma contagem de verificações de produção. Logs completos, audit JSON e captura mobile fictícia estão em docs/evidence/ e docs/browser-mobile.png. Os testes de dinheiro/filtros/seleção/revisão/WhatsApp e segurança anteriores foram preservados; a premissa antiga de ausência de tabelas financeiras foi atualizada para grants e escrita pública proibida.

Os testes de banco executam PostgreSQL 17.10 nativo em diretório descartável, sem URL externa. Exercitam RLS/grants, visitante/login comum/admin, revogação, constraints, imutabilidade, auditoria, snapshots, dinheiro/arredondamento, rollback integral, idempotência, recebimentos/estornos, condicional parcial, reversões, quitação, cancelamento e concorrência real entre duas conexões.

O teste de navegador cobre catálogo/revisão, cliente, entrada, entrega/retorno/compra parcial com Pix, recebimento/quitação, cancelamento com estorno, exportação, erro de rede, usuário sem autorização e viewport 390 px sem overflow. Testes inicialmente detectaram seletor de label exato incompatível com o label do select; seletor corrigido e fluxo inteiro reexecutado. Nenhum teste foi eliminado para obter aprovação.

## 6. Segurança e limites da validação

As 11 tabelas B têm RLS e apenas leitura administrativa pela API. Escritas passam por RPC com verificação do administrador; funções auxiliares não são executáveis por anon/authenticated. SECURITY DEFINER usa search_path vazio e referências qualificadas. A quantidade de produto existente não pode ser alterada diretamente pela API. Idempotência e locks protegem duplicação/estoque; cancelamentos não excluem registros.

Fundação, money.ts, whatsapp.ts, Price.tsx e logo oficial foram conferidos por SHA-256 contra a linha de base desta missão; preservados. Nenhum arquivo de ambiente foi impresso ou incluído em backup de código/fixtures. `.gitignore` foi ampliado para dados e backups. O backup pré-entrega foi validado em bytes.

Auth/Storage do runner PostgreSQL são contratos mínimos. Chromium usa uma sessão fictícia e um adaptador de transporte para executar SQL no banco isolado: **isso não comprova PostgREST, JWT/Auth ou Storage reais do Supabase**. Não houve teste de envio real de WhatsApp, de estorno em operadora, de restore completo, ou de publicação.

## 7. Homologação manual pendente

Executar os 12 passos de TEST_PLAN.md no Supabase exclusivo de testes, com dados fictícios: catálogo/imagens/WhatsApp; tokens anon/login comum/admin; cliente/auditoria; produto/upload; condicional parcial; venda direta; crédito parcial/quitação; estornos/devoluções; corrida de duas abas e replay; datas/CSV; falha de rede; teclado/mobile. Guardar evidências sem credenciais ou dados reais.

O banco de teste ainda pode estar somente em B. A entrega local não confirma instalação da nova migração nesse projeto, nem implica autorização para produção. Restos de scripts de diagnóstico anteriores no schema de teste não foram removidos automaticamente.

## 8. GitHub, Cloudflare, domínio e backups

Preparação documentada em DEPLOYMENT.md: GitHub privado após revisão de arquivos, Node 24, build npm run build, saída dist, SPA fallback existente, variáveis do alvo correto, Auth redirects, domínio jaquepratas.com.br e HTTPS. Não houve Git reconhecido, push, deploy ou DNS.

Backup completo exige schema/dados/Auth e bytes/caminhos/checksums dos objetos Storage; CSV ou ZIP de código não substitui isso. Restauração deve ser ensaiada em projeto separado. Não foi declarada aprovação de backup/restore sem executá-los.

## 9. Pendências e riscos restantes

1. Instalar/homologar a nova migração no Supabase de teste autorizado e verificar API/Auth/Storage reais; produção continua sem alterações.
2. Ensaio de backup/restauração de banco e imagens, seguido de revisão de publicação com autorização específica.
3. Snapshot administrativo sem paginação e lock global podem exigir evolução com aumento de volume. Não há teste de carga em grande escala.
4. Cliente identificado, confirmação de retorno físico, coerência Pix e confirmação de devolução financeira são restrições conservadoras documentadas. Venda anônima, método misto ambíguo e perda de peça já vendida sem retorno exigem definição comercial adicional.
5. Recebimentos/estornos não possuem integração bancária/operadora; datas/valores registrados dependem da confirmação da proprietária. Lucro omitido por ausência de custos/despesas confiáveis.
6. A chave de tentativa é preservada em memória no formulário enquanto a página permanece aberta e os dados não mudam. A API aceita replay idempotente com a chave original, mas não há recuperação automática dessa chave após fechar/recarregar a página em falha de resposta ambígua: consultar o histórico antes de criar outra operação.
7. Esta rodada automatizada não é uma auditoria formal de acessibilidade ou um teste exaustivo de navegadores antigos. O Chromium e o viewport móvel descritos foram efetivamente exercitados.

## 10. Arquivos da entrega

O manifesto docs/CHANGESET.json lista os arquivos alterados/criados e a remoção da página placeholder sem uso, além do caminho do backup. Evidências, este relatório e o manifesto foram adicionados após a rodada final. Nenhum arquivo de cliente/banco real integra essas evidências.


Arquivos de implementação/documentação transferidos:

- `.nvmrc`
- `README.md`
- `package.json`
- `package-lock.json`
- `AGENTS.md`
- `.gitignore`
- `supabase/verify_installation.sql`
- `supabase/tests_full_sql_editor.sql`
- `src/App.tsx`
- `docs/README_MARCO2_HISTORICO.md`
- `docs/DEPLOYMENT.md`
- `docs/TEST_PLAN.md`
- `docs/DECISIONS.md`
- `docs/BUSINESS_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/browser-mobile.png`
- `docs/PROJECT_PROGRESS.md`
- `docs/PROGRESS.md`
- `src/styles/admin.css`
- `src/lib/management.test.ts`
- `src/lib/management.ts`
- `src/lib/security.test.ts`
- `src/lib/adminProducts.ts`
- `src/components/Dialog.tsx`
- `src/admin/ManagementPage.tsx`
- `src/admin/services.ts`
- `src/admin/ProductForm.tsx`
- `src/admin/DashboardPage.tsx`
- `src/admin/AdminLayout.tsx`
- `supabase/migrations/20261029000000_operacoes.sql`
- `supabase/migrations/20261028000000_gestao_base.sql`
- `tests/database/platform-fixture.sql`
- `tests/database/management.test.mjs`

Removido da árvore ativa: `src/admin/ComingSoonPage.tsx` (sem rotas restantes para placeholder).
