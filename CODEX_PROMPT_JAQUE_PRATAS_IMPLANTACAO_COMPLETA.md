# CODEX — JAQUE PRATAS V4.0 | IMPLANTAÇÃO INTEGRAL EM UMA MISSÃO

## MISSÃO E MODO DE EXECUÇÃO

Atue como engenheiro principal full-stack, arquiteto de dados e responsável pela qualidade. Você está no workspace real do projeto JAQUE PRATAS no VS Code. Sua missão é **implementar todos os módulos pendentes em uma única execução contínua**, passando por auditoria, desenvolvimento, migrações versionadas, integração, testes, correções e documentação. **Não pare após cada marco para solicitar autorização**; os marcos são checkpoints internos, não entregas que exigem uma nova mensagem do usuário. Trabalhe até completar tudo que puder executar com segurança.

**PRIMEIRA AÇÃO OBRIGATÓRIA:** leia integralmente `PROJECT_CONTEXT.md` na raiz do workspace. Em seguida, leia `AGENTS.md` se existir, `README.md`, `package.json`, as migrações em `supabase/`, o código-fonte e os testes. `PROJECT_CONTEXT.md` é o contexto comercial e histórico, mas o código e o esquema real do workspace são a fonte de verdade para implementação. Se houver divergência, registre-a em `docs/DECISIONS.md`, preserve a integridade dos dados e use a regra comercial explícita deste prompt como requisito. Não invente detalhes não confirmados.

Se o arquivo `PROJECT_CONTEXT.md` não existir, procure-o na raiz ou solicite ao usuário que o coloque lá antes de implementar mudanças comerciais complexas. Não o substitua por uma versão resumida inventada.

## REGRAS INEGOCIÁVEIS

- Evolua o projeto existente React + TypeScript + Vite + Supabase; **não recrie a aplicação** nem substitua o backend por mocks ou localStorage.
- Preserve catálogo, filtros, produtos, imagens, promoções, autenticação administrativa, seleção, revisão e abertura do WhatsApp.
- Preserve a identidade JAQUE PRATAS: luxo discreto, grafite, prata, branco/bege, logo e assets oficiais. Não faça redesign generalizado.
- O catálogo público não exige login. Uma seleção enviada ao WhatsApp é **solicitação**, não pedido persistido, venda, reserva, condicional física, pagamento ou dívida.
- Implemente código real, persistência, validação, autorização, testes e estados de interface; não deixe botões fictícios ou páginas “em breve” para os módulos solicitados.
- Nunca imprima ou versione `.env.local`, segredos, tokens ou chaves privadas. Nunca use `service_role` no navegador.
- **Autonomia para editar arquivos e criar migrações locais, executar comandos não destrutivos, testes, builds e ambiente Supabase local/de testes autorizado.** Não faça push, deploy, DNS, alteração de administradores reais, migração em produção, exclusão/reset de dados reais ou alteração destrutiva sem aprovação explícita. Essas barreiras não impedem concluir o restante da implementação: registre pendências e prossiga.
- Não execute `npm audit fix --force` automaticamente. Avalie e trate dependências com compatibilidade e testes.
- Não altere dados de produção para testar. Não declare sucesso de integração real quando só houve mock.

## FASE 0 — AUDITORIA, LINHA DE BASE E CONTINUIDADE

1. Verifique `git status`, branch, alterações locais, scripts, dependências e arquivos importantes. Não sobrescreva alterações do usuário. Se for viável, crie uma branch de trabalho local sem mexer em branches remotas; caso contrário preserve um registro do estado inicial.
2. Execute `npm ci` quando apropriado, `npm test`, `npm run build` e `npm audit`; se um comando falhar, registre o erro e corrija causas relevantes sem apagar testes.
3. Inspecione `src/lib/money.ts`, componentes de preço, seleção, WhatsApp, admin, auth, serviços Supabase, SQL de fundação, `catalog_products`, `stock_movements`, triggers, políticas RLS e Storage. Verifique a versão real do esquema.
4. Crie/atualize `AGENTS.md` com instruções permanentes para o Codex e `docs/PROJECT_PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `docs/DECISIONS.md`, `docs/TEST_PLAN.md`, `docs/DEPLOYMENT.md`. Mantenha documentação concisa e fiel ao código. Atualize o progresso após cada fase.
5. Continue automaticamente para as próximas fases; não encerre a execução entregando apenas um plano.

## FASE 1 — PREÇOS, PROMOÇÕES E WHATSAPP

**Regra oficial:** o preço-base aplicável é o promocional válido, quando existir, senão o normal. Cartão (inclusive parcelado) usa o preço-base integral; Pix tem **10% de desconto sobre o preço-base**, cumulativo com promoções. Não invente parcelas, taxas ou juros.

Exemplos: R$ 100 normal → cartão R$ 100 / Pix R$ 90. R$ 200 normal com promoção R$ 160 → cartão R$ 160 / Pix R$ 144. R$ 39,90 normal → Pix R$ 35,91.

- Centralize cálculos em módulo puro reutilizável, reaproveitando `money.ts`; use centavos inteiros ou decimal exato e arredondamento testado. Não armazene `pix_price` redundante no cadastro.
- Atualize cards, detalhes, promoções, seleção, revisão, subtotais e totais; exiba claramente Pix e cartão sem comprometer o design.
- Atualize mensagem WhatsApp para listar itens/quantidades, totais estimados para Pix e cartão, desconto e aviso de confirmação de disponibilidade/valores. Preserve revalidação antes de abrir o WhatsApp.
- Garanta que a solicitação pública não altere banco/estoque nem crie venda ou dívida.
- Teste centavos, promoções, múltiplas quantidades, arredondamento, revalidação e consistência entre UI e mensagem.

## FASE 2 — MODELAGEM SEGURA E OPERAÇÕES ATÔMICAS

Inspecione o SQL atual antes de criar novas migrações. Projete e implemente, de acordo com as convenções reais, entidades para clientes, condicionais e itens, vendas e itens, pagamentos, reversões e auditoria. Reaproveite `products`, `stock_movements`, `admin_users`, `catalog_products` e triggers existentes. **Não duplique histórico de estoque** se uma trigger já o registra. Não reescreva migrações de fundação possivelmente aplicadas: crie migrações incrementais versionadas.

- Use chaves, FKs, checks, índices, `numeric`/centavos com precisão fixa, invariantes e estados explícitos.
- Implemente RPCs/funções transacionais para confirmar saídas de condicional, retornos, vendas, pagamentos, cancelamentos, estornos e ajustes. Evite sequências de writes independentes do frontend.
- Proteja contra estoque negativo, concorrência, corrida pela última unidade, duplo clique e requisições repetidas (idempotência).
- Não aceite totais financeiros ou permissões arbitrárias enviados pelo cliente. Valide preços, quantidades e direitos no backend; snapshots de venda preservam preço/quantidade/desconto do momento da confirmação.
- RLS: visitantes leem apenas catálogo público; clientes, condicionais, vendas, pagamentos, auditoria e observações são privados. Usuário autenticado não é automaticamente administrador. Revise views, Storage, grants e funções `SECURITY DEFINER` com `search_path` seguro.
- Crie testes SQL/integrados em banco isolado, inclusive acesso anônimo, usuário sem privilégio, administrador, concorrência e idempotência. Se o ambiente não permitir, entregue testes executáveis e documente a lacuna, sem afirmar aprovação.

## FASE 3 — ESTOQUE E CLIENTES

Implemente telas administrativas reais de estoque: consulta/pesquisa/filtros, quantidade disponível, em condicional e física conforme o modelo, entrada, ajuste com motivo, perdas/danos, estoque baixo e histórico auditável. Entrada, saída, retorno, venda e reversão devem manter saldos coerentes. Não permita retorno duplicado ou estoque negativo.

Implemente cadastro interno de clientes (nome, telefone opcional, observações necessárias, status), pesquisa, edição e histórico de compras, condicionais, pagamentos e saldo a receber. Sem login para clientes públicos; proteja dados pessoais e não exponha em consultas públicas. Histórico não deve mudar quando cadastro é editado.

## FASE 4 — CONDICIONAIS REAIS

Fluxo: preparar → selecionar cliente/produtos/quantidades/prazo opcional → confirmar **entrega física** → retirar disponibilidade → registrar retornos parciais, compras parciais, perdas/danos e quantidades ainda pendentes → concluir somente quando todas as unidades tiverem destino. Implementar estados e transições válidas, vínculos com vendas e trilha de auditoria.

Invariantes: quantidade comprada + devolvida + perdida/danificada + ainda pendente = quantidade efetivamente entregue, conforme eventos já registrados. Nenhuma quantidade negativa, acima do entregue ou processada duas vezes. Uma solicitação do WhatsApp não cria condicional física.

A interface deve permitir criar, consultar, filtrar, visualizar detalhes, registrar retornos e concluir com mensagens de erro/sucesso verificadas pelo backend.

## FASE 5 — VENDAS, PAGAMENTOS E CONTAS A RECEBER

- Venda direta e venda derivada de condicional, com itens, quantidades, cliente opcional quando apropriado, método de pagamento, total e confirmação. Venda de condicional não deve baixar estoque uma segunda vez se a peça já saiu fisicamente; ajuste a contabilidade de disponibilidade e propriedade de forma coerente.
- Registre snapshots históricos: produto, descrição relevante, preço normal, promoção, desconto Pix, preço final, quantidades, cliente, data, usuário, origem e total. Mudanças posteriores no catálogo não alteram vendas passadas.
- Pagamentos: Pix, dinheiro, cartão e método extensível; registre eventos de recebimento com data, valor, método e responsável. Aceite pagamentos parciais e calcule saldo a receber a partir de lançamentos válidos, sem sobrescrever histórico.
- Diferencie parcelamento processado por operadora de cartão de crédito concedido pela própria loja; não trate automaticamente cartão parcelado como dívida da cliente. Não invente taxas, juros, número de parcelas ou calendário de repasse.
- Implemente cancelamento, devolução parcial/total, estorno e correções por eventos auditáveis, nunca exclusão silenciosa. Não permita receber acima do saldo sem regra explícita, nem devolver mais unidades do que foram vendidas.
- Se alguma regra comercial essencial não estiver definida, escolha um comportamento **conservador e seguro** (por exemplo, impedir operação ambígua e exibir aviso claro), registre a decisão e siga implementando os fluxos definidos. Não invente política de juros, frete ou crédito.

## FASE 6 — DASHBOARD, RELATÓRIOS E EXPORTAÇÃO

Substitua placeholders por consultas reais: total vendido no período, recebido, a receber, vendas, condicionais abertas, produtos disponíveis/em condicional, estoque baixo, devoluções e cancelamentos. Filtros por período, cliente, produto, categoria, método e status conforme aplicável. Visual limpo, responsivo e consistente com a marca.

**Não confunda faturamento, recebimento, dívida, custo e lucro.** Só calcule lucro se existirem custos e despesas confiáveis; caso contrário omita ou rotule adequadamente. Implemente exportação CSV útil e segura, com proteção de dados pessoais e controles administrativos.

## FASE 7 — QUALIDADE, SEGURANÇA E PRONTIDÃO PARA PUBLICAÇÃO

- Preserve testes existentes e acrescente testes unitários, de integração e de fluxos para preços, promoções, estoque, concorrência, condicionais, vendas, devoluções, pagamentos, estornos, RLS e permissões.
- Teste estados de carregamento, vazios, falha de rede, duplicidade de submissão, formulários, acessibilidade e responsividade.
- Execute `npm test`, TypeScript e `npm run build`; revise `npm audit` sem upgrades destrutivos automáticos. Se houver testes de navegador disponíveis, execute-os.
- Revise `.gitignore` para excluir `.env.local`, `node_modules`, `dist`, segredos e backups sensíveis. Não mostre valores de variáveis. Documente variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_NUMBER` e quaisquer novas realmente necessárias.
- Documente backup e restauração do banco **e** Supabase Storage, migrações, rollback seguro, configuração GitHub privado, Cloudflare Pages (build `npm run build`, saída `dist`, SPA routing), domínio `jaquepratas.com.br`, HTTPS e smoke tests. **Prepare, mas não faça push, deploy ou mudanças DNS sem autorização.**
- Não inclua dados reais de clientes em fixtures, logs ou capturas.

## FLUXO DE TRABALHO SEM PAUSAS ENTRE FASES

1. Execute todas as fases sequencialmente nesta mesma missão, com checkpoints técnicos internos.
2. Após cada fase: execute testes relevantes, corrija falhas e atualize `docs/PROJECT_PROGRESS.md` com arquivos, resultados, limitações e próxima fase. **Não aguarde autorização para iniciar a próxima fase**, exceto para ações explicitamente restritas.
3. Se contexto/sessão se esgotar, registre o estado exato, comandos e próximo passo em `docs/PROJECT_PROGRESS.md` para retomada sem retrabalho. Continue automaticamente enquanto o ambiente permitir; não prometa trabalho em segundo plano.
4. Não faça grandes refatorações não relacionadas, nem elimine testes para obter verde. Não diga que uma migração foi aplicada se apenas foi escrita.
5. Use dados fictícios somente em testes/fixtures isolados; jamais substitua persistência real por mocks no produto.

## CRITÉRIOS DE ACEITAÇÃO

A implementação só está funcionalmente concluída quando: catálogo e WhatsApp continuam operacionais; preços Pix/cartão e promoções são consistentes; estoque é auditável e não fica negativo; condicionais registram saídas e retornos parciais; vendas diretas e derivadas têm snapshots históricos; pagamentos parciais, quitação, devoluções e estornos mantêm saldos corretos; painel e relatórios usam dados reais; RLS bloqueia visitantes e usuários não autorizados; testes e build passam; migrações e instruções de deploy/backup estão documentadas. Identifique separadamente tudo que depende de acesso ao ambiente de testes/produção.

## RELATÓRIO FINAL

Ao terminar, entregue um relatório verificável com: (1) funcionalidades implementadas e pendências, (2) arquivos e migrações criados/alterados, (3) arquitetura e decisões relevantes, (4) testes/comandos executados e resultados reais, (5) segurança/RLS e limitações da validação, (6) passos exatos para aplicar migrações em ambiente autorizado, (7) roteiro de testes manuais de ponta a ponta, (8) preparação de GitHub/Cloudflare/domínio e (9) riscos restantes. **Não chame de pronto algo que não foi testado ou aplicado.**

**INICIE AGORA: LEIA `PROJECT_CONTEXT.md` INTEGRALMENTE, AUDITE O WORKSPACE E IMPLEMENTE TODAS AS FASES SEM PARAR ENTRE ELAS.**
