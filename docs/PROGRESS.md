# Progresso — JAQUE PRATAS

> Histórico anterior. A autorização posterior de missão integral e o estado atual estão em docs/PROJECT_PROGRESS.md e docs/RELATORIO_TECNICO.md.

## 2026-10-28 — Marco A concluído

### Auditoria

- Leitura integral de PROJECT_CONTEXT.md e CODEX_PROMPT_JAQUE_PRATAS.md; inspeção de README, package.json, .gitignore, árvore, rotas, seleção/revalidação, preços, WhatsApp, testes e SQL de fundação/bootstrap.
- A aplicação está na subpasta `jackpratas/` do workspace. `git status --short` não foi possível: não há repositório Git reconhecido nesta cópia. Não foi criado repositório nem realizado commit/push.
- A view catalog_products calcula current_price por coalesce(promo_price, price). CHECKs exigem promoção não negativa e menor que o preço normal; zero é válido. O frontend continua consumindo esse preço vigente.
- Rotas administrativas e placeholders conferidos; não há implementação financeira persistida. Leitura pública restrita à view e categorias; RLS, is_admin SECURITY DEFINER com search_path fixo, políticas de Storage e trigger de histórico inspecionados estaticamente. A view opera deliberadamente com privilégios do proprietário e filtra ativos/não arquivados. Nada disso comprova o estado remoto.
- Nenhum arquivo de ambiente teve conteúdo lido ou impresso. Dependências existentes foram suficientes; nenhuma instalação ou alteração de lockfile.
- Inicialmente npm ausente do PATH. Runtime Node do aplicativo permitiu a verificação inicial: seis arquivos de testes passaram via carregador tsx; tsc e vite build passaram. O comando tsx padrão falhou por restrição IPC do sandbox, não por teste.

### Implementação e decisões

- `src/lib/money.ts`: pixCents centraliza 90% do preço vigente usando inteiros/BigInt. Arredonda o preço unitário ao centavo mais próximo, com meio centavo para cima; depois multiplica pela quantidade. Ex.: R$ 10,05 -> R$ 9,05 no Pix; duas unidades -> R$ 18,10.
- `src/components/Price.tsx`: componente compartilhado entre cards e detalhes, com preço normal riscado quando promocional, cartão vigente e Pix acumulativo.
- `src/components/SelectionDrawer.tsx`: unitários, subtotais e totais para cartão e Pix.
- `src/components/ReviewList.tsx`: revisão com os dois preços e totais coerentes.
- `src/lib/whatsapp.ts`: mensagem com unitários/subtotais/totais para ambas as formas; esclarece que solicitação não é compra nem reserva.
- `src/components/ConditionalReview.tsx` e `src/pages/CatalogPage.tsx`: textos públicos ajustados para JAQUE PRATAS. Logo, assets, CSS, identificadores técnicos e armazenamento local preservados.
- Revalidação ao entrar na revisão e antes de abrir WhatsApp preservada: mudanças exigem ciência da cliente. Nenhuma escrita pública no banco adicionada.
- `src/lib/pix.test.ts` criado; `src/lib/whatsapp.test.ts` atualizado. Cobertura de preço normal/promocional, desconto acumulativo, arredondamento, zero, valores inválidos, múltiplas unidades, atualização de promoção/estoque e consistência revisão/mensagem.
- `AGENTS.md` criado na aplicação, com leitura obrigatória do contexto e limites de autorização; um AGENTS.md na raiz externa direciona futuras sessões à aplicação.
- Migrações criadas/alteradas: nenhuma. Sem coluna pix_price.

### Validação final efetivamente executada

- `npm test`: **42 testes passaram, zero falhas**, com Node v26.13.0 do NVM, adicionando NVM_BIN ao PATH. Foi necessário executar fora da restrição IPC do sandbox, mediante aprovação automática da ferramenta.
- `npm run build`: **passou**, incluindo tsc --noEmit e Vite 5.4.21 (102 módulos).
- Verificação adicional: Node do aplicativo com `--import tsx --test --test-isolation=none src/lib/*.test.ts`: **42 testes passaram**.
- dist foi regenerado pelo build; permanece ignorado por .gitignore.

### Limitações e próximo passo

- Sem teste visual/interativo em navegador nesta execução. Renderização estática de Price e ReviewList testada, mas não comprova layout/responsividade.
- Sem conexão de teste ao Supabase real, ensaio real de RLS/login/imagens ou envio real pelo WhatsApp. Testes puros e de segurança estática não substituem integração.
- Nenhum deploy, push, DNS, migração ou alteração no banco remoto realizado.
- **Marco B não iniciado. Depende de autorização explícita do proprietário.** Antes de iniciar, reler contexto/progresso e planejar ambiente Supabase isolado para modelagem incremental, autorização e testes reais de integração.


## 2026-10-28 — Marco B autorizado; implementação local validada, Supabase completo pendente

### Autorização e diagnóstico

- Proprietário autorizou prosseguir com o Marco B após a entrega do Marco A. AGENTS.md da aplicação e da raiz externa foram atualizados para refletir a autorização, mantendo a exigência de autorização específica para banco real.
- Contexto, prompt, instruções e progresso relidos integralmente; código de autorização, testes de segurança, package.json e fundação SQL reinspecionados.
- Workspace continua sem Git reconhecido. Docker, Supabase CLI, psql e PostgreSQL não estavam disponíveis; não se instalou software de sistema nem se criou usuário do sistema.
- Fundação SQL, auth.tsx, adminProducts.ts e global.css foram comparados em bytes ao ZIP recebido: permanecem idênticos.

### Arquivos e decisões

- Nova migração `supabase/migrations/20261028000000_gestao_base.sql`: clientes e auditoria, condicionais físicas/itens/eventos, vendas/itens com snapshots e cálculo decimal do desconto, pagamentos/estornos, reversões por item e registro de chaves de operação. Aditiva, transacional, aplicada uma vez pelo histórico; fundação não reescrita.
- Todas as 11 tabelas novas possuem RLS, revogação explícita de grants amplos e apenas SELECT administrativo. Nenhuma escrita de negócio disponível pela API, mesmo para admin, até as RPCs dos próximos marcos.
- `is_admin()` preserva o contrato com Auth/admin_users e passa a usar search_path vazio. Funções auxiliares não têm EXECUTE público. Imutabilidade por triggers cobre UPDATE/DELETE/TRUNCATE dos históricos; cadastro admite edição auditada e arquivamento.
- Venda e recebimento separados; cartão e prazo de crédito da loja são conceitos distintos. Snapshots não dependem de futuras mudanças em products. Total de linha é gerado pelo PostgreSQL, sem confiar no frontend. Nenhuma coluna Pix criada em products.
- `tests/database/management.test.mjs` e `tests/database/platform-fixture.sql`: cluster PostgreSQL 17.10 nativo descartável, senha aleatória, porta livre de loopback, limpeza ao final; sem leitura de .env e sem URL remota. Auth/Storage têm contratos mínimos de teste; não são o Supabase completo.
- `package.json` e `package-lock.json`: embedded-postgres@17.10.0-beta.17 fixado como dependência de desenvolvimento; novo script `npm run test:db` (Node 24+). Postinstall Linux x64 inspecionado e permitido em allowScripts para hidratar links das bibliotecas; nenhuma dependência de produção adicionada.
- `src/lib/security.test.ts`: substituída a premissa histórica de ausência de tabelas financeiras por verificação de grants fechados; proteção contra escrita do código público preservada.
- `supabase/tests/database/management.test.sql`: suíte pgTAP preparada para Supabase descartável com Auth real; **não executada** neste ambiente.
- `docs/MARCO_B_DATABASE.md`: modelo, permissões, testes reproduzíveis e limites/futuras invariantes. README atualizado com estado atual, preservando documentação histórica do Marco 2.

### Evidências executadas

- `npm run test:db`: **14 testes aprovados, zero falhas**, executados fora da restrição de sockets do sandbox por aprovação automática. Incluem migrações completas, grants e RLS das 11 tabelas, anon/usuário comum/admin, revogação de autorização, proibição de escrita direta, snapshots, Pix/promocional/cartão/zero, imutabilidade, auditoria, constraints, rollback completo e unicidade de chave sob duas conexões concorrentes.
- `npm test`: **42 testes aprovados, zero falhas** após atualização da segurança estática; executado fora da restrição IPC do sandbox.
- `npm run build`: **passou**, incluindo TypeScript e Vite, com 102 módulos. Bundle público permanece com o mesmo nome/hash da entrega do Marco A, pois nenhum código funcional de frontend foi modificado no Marco B.
- Um teste de Infinity inicialmente esperava CHECK (23514); PostgreSQL corretamente o rejeitou antes como overflow (22003). Expectativa corrigida e suíte reexecutada integralmente.
- Clusters temporários encerrados/removidos; nenhuma migration foi aplicada ao Supabase real, nenhum push/deploy/DNS ou leitura de segredos.

### Limites e continuidade

- **Marco B ainda não está integralmente concluído**: falta executar a suíte preparada no Supabase completo isolado e validar acesso via PostgREST/JWT, Auth e Storage reais. O PostgreSQL local comprova a camada SQL, mas contratos mínimos de plataforma não comprovam a integração Supabase.
- Solicitada ao proprietário a preferência por ambiente Supabase local com Docker ou projeto exclusivamente de testes; nenhuma conexão remota será presumida a partir de .env.local.
- Não há RPCs nem telas novas de clientes/condicionais/vendas/pagamentos. Limites agregados (estoque, retornos acumulados, estornos acumulados), replay de payload idempotente e operações transacionais de negócio continuam para os marcos C–G. A API permanece fechada para essas escritas até lá.
- Não avançar ao Marco C antes de resolver a validação pendente do Marco B e alinhar a continuidade com o proprietário. Antes de qualquer banco real, obter autorização explícita para o alvo correto.


## 2026-10-29 — Retorno efetivo dos arquivos locais ao Marco A

- Proprietário solicitou retorno ao Marco A após recuperar acesso ao disco. Projeto localizado em `/media/pekaasasus/Disco-Movel/PROJETOS/PROJETO-JAQUEPRATAS/WEB-V3.0.0/jackpratas-marco2/jackpratas`.
- Backup anterior às alterações: `../../backups/marco_b_antes_retorno_A_20261029.zip`, relativo a esta pasta docs. Arquivo ZIP validado e conteúdo comparado em bytes; sem credenciais ou arquivos de ambiente.
- Mantidos todos os arquivos funcionais do Marco A, inclusive Pix/promocional, seleção/revalidação, revisão e WhatsApp. Somente security.test.ts retornou à verificação original sem modelagem financeira local; demais fontes conferidas por SHA-256 antes/depois.
- package.json e package-lock.json restaurados do ZIP original. Confirmado que entradas preexistentes do lock não tinham outras alterações. Removidos do escopo ativo a dependência embedded-postgres, script test:db, migração B, testes de banco B e docs/MARCO_B_DATABASE.md. Arquivos preservados no backup.
- README e AGENTS.md refletem o retorno ao Marco A. Histórico anterior deste documento preservado. Marco B não deve ser retomado sem nova autorização.
- A migração B foi aplicada pelo proprietário no projeto Supabase exclusivo de testes e seu sucesso foi informado na conversa. O resultado pgTAP `1..76` sozinho não comprovou a aprovação de todas as asserções; tentativas posteriores de agrupar resultados falharam.
- **Nenhuma alteração remota nesta restauração.** As tabelas B e eventuais objetos auxiliares continuam podendo existir no banco de testes. O retorno local não reverte esse banco.
- Arquivos de ambiente preservados sem leitura ou exposição. Dependências B eventualmente instaladas em node_modules não fazem mais parte do manifesto/lock; não foi executada limpeza destrutiva dessa pasta.
- Validação desta restauração: **42 testes passaram**, via Node do aplicativo com `--import tsx --test --test-isolation=none src/lib/*.test.ts`; `tsc --noEmit` passou; Vite build passou (102 módulos). Bundle `index-AiLDHHyQ.js`, mesmo da entrega original do Marco A. Execução no projeto restaurado, sem conexão de teste ao Supabase.


## 2026-10-29 — Missão integral posterior autorizada

O proprietário autorizou todas as fases sem pausas entre marcos, mantendo restrições para produção/dados reais/deploy. Modelo B reaproveitado do backup e estendido, módulos de gestão implementados com persistência via RPC. Consultar PROJECT_PROGRESS.md e RELATORIO_TECNICO.md para arquivos, decisões, resultados reais e pendências. Os registros de retorno ao Marco A acima são históricos e não representam a autorização mais recente.
