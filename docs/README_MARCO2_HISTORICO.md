# JackPratas — Sistema web (Marco 2: catálogo público e solicitação de condicional)

> Estado atual (29/10/2026): Marco A, com desconto Pix de 10% acumulativo sobre promoção. Alterações locais do Marco B retiradas a pedido do proprietário, com backup. O banco Supabase de testes não foi revertido. Consulte `docs/PROGRESS.md`.

Catálogo digital de joias em prata (área pública) + painel administrativo da proprietária.
Stack: React + TypeScript + Vite, Supabase (PostgreSQL, Auth, Storage), Cloudflare Pages.

## Funcionalidades (Marcos 1 e 2)

| Recurso | Situação |
|---|---|
| Catálogo público lendo produtos reais do Supabase (busca, categorias, ordenação, detalhes, promoção, disponibilidade) | Implementado |
| Seleção de peças com quantidade limitada ao estoque e soma dos valores | Implementado (fica só no navegador da cliente) |
| Login administrativo (Supabase Auth) com verificação de autorização (`admin_users`) | Implementado |
| Cadastro, edição, ativação/desativação e arquivamento de produtos | Implementado |
| Upload, troca de principal e remoção de fotos (Supabase Storage) | Implementado |
| Histórico de estoque (`stock_movements`) gravado automaticamente por trigger | Implementado |
| RLS em todas as tabelas, view pública sem dados internos, bucket com escrita só para admin | Implementado |
| **Revisão da seleção e solicitação de condicional pelo WhatsApp** (Marco 2) | Implementado. Revisão com peças, quantidades, unitários, subtotais, total estimado e nome opcional; mensagem pronta e link `wa.me` codificado |
| **Revalidação de preço/disponibilidade** (Marco 2) | Implementado. Ao abrir a revisão e de novo ao clicar no botão, os dados atuais são consultados; mudança de preço, peça arquivada/sem estoque ou quantidade acima do disponível é informada à cliente e **nunca** usa preço antigo em silêncio |
| **Pedidos recebidos e Condicionais no painel** | **NÃO implementado** (marco futuro). Telas marcadas “Ainda não implementado”. A solicitação sai só pelo WhatsApp: **não é gravada no banco** |
| **Vendas, clientes internos, fiado, pagamentos** | **NÃO implementado** (Marco 3). Indicadores do início aparecem como “—”. |
| Exportação/recuperação de dados, revisão final de segurança | Marco 4 |

## Pré-requisitos

- Node.js 20 ou superior e npm.
- Uma conta gratuita no [Supabase](https://supabase.com) e outra na [Cloudflare](https://dash.cloudflare.com).
- (Opcional) [Supabase CLI](https://supabase.com/docs/guides/cli) para aplicar migrações por linha de comando.

## Instalação local

```bash
npm install
cp .env.example .env.local     # depois edite com os dados do seu projeto
npm run dev                    # abre em http://localhost:5173
```

Outros comandos: `npm test` (testes de dinheiro, seleção, filtros, WhatsApp e segurança estática), `npm run build` (checagem de tipos + build em `dist/`), `npm run preview`.

## Variáveis de ambiente

No Supabase: **Project Settings → API**.

| Variável | O que é |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto |
| `VITE_SUPABASE_ANON_KEY` | chave pública `anon` / publishable |
| `VITE_WHATSAPP_NUMBER` | número comercial do WhatsApp da loja (ver seção abaixo). Opcional para rodar o site, **obrigatório** para o envio da solicitação funcionar |

**Nunca** use a chave `service_role` no front-end. Tudo com prefixo `VITE_` vai para o navegador. A segurança vem do RLS no banco.

## Criar o projeto Supabase e aplicar as migrações

1. Crie um projeto novo em supabase.com.
2. Aplique a migração `supabase/migrations/20260101000000_fundacao.sql`:
   - **Com CLI:** `supabase login`, `supabase link --project-ref SEU_REF`, `supabase db push`.
   - **Sem CLI:** abra **SQL Editor**, cole o conteúdo do arquivo e execute.
3. A migração já cria as categorias iniciais, o histórico de estoque, as políticas de RLS e o bucket `product-images`.

## Bucket de imagens

Criado pela própria migração: `product-images`, leitura pública por URL (necessária para o catálogo), limite de 5 MB e somente JPG/PNG/WebP. Envio, troca e exclusão exigem administrador autorizado. Confira em **Storage** que o bucket existe e que as políticas aparecem; se o SQL Editor recusar as políticas de `storage.objects`, crie-as pela interface de **Storage → Policies** com as mesmas regras do arquivo.

## Criar o administrador inicial (com segurança)

Não existe cadastro público de administradores.

1. **Authentication → Providers → Email:** desative **Allow new users to sign up** (sem cadastro aberto).
2. **Authentication → Users → Add user:** crie a conta da proprietária com e-mail e senha escolhidos por ela.
3. No **SQL Editor**, rode `supabase/bootstrap_admin.sql` trocando o e-mail pelo dele. Só quem está em `admin_users` acessa o painel; ter uma conta no Auth não basta.
4. Entre em `/admin`.

## Número do WhatsApp (configuração do proprietário)

O número **não está no código** e não existe número padrão. Informe o número REAL da loja:

1. Local: em `.env.local`, preencha `VITE_WHATSAPP_NUMBER=5569912345678` (DDI 55 + DDD + número, só dígitos).
   Também são aceitos formatos como `(69) 91234-5678` ou `+55 69 91234-5678`; números com 10 ou 11 dígitos são entendidos como brasileiros e recebem o 55.
2. Produção (Cloudflare Pages): **Settings → Environment variables**, crie `VITE_WHATSAPP_NUMBER` e faça um novo deploy (variáveis `VITE_` são embutidas no momento do build).
3. Reinicie o `npm run dev` depois de alterar o `.env.local`.

Se a variável estiver vazia ou inválida, a cliente vê o aviso “a loja ainda não configurou o número de atendimento” e o botão de envio fica desativado. Nenhum link quebrado é gerado.

## Como funciona a solicitação de condicional

1. A cliente monta a seleção (fica no navegador dela, sem cadastro ou senha).
2. **Revisar e solicitar condicional** abre a revisão, que consulta o catálogo atual (somente leitura da view `catalog_products`).
3. **Abrir WhatsApp com a solicitação** consulta o catálogo de novo; se algo mudou, avisa e pede confirmação antes de seguir. Só então abre `https://wa.me/<número>?text=<mensagem codificada>`.
4. A mensagem só chega à loja quando a cliente toca em enviar no WhatsApp.

**Regras comerciais deste marco:** a seleção e a solicitação não são venda; não reservam peças; não reduzem estoque; não registram movimentação financeira. O sistema não afirma que um condicional foi aprovado ou separado. A reserva/saída física das peças será tratada no marco do controle administrativo de condicionais.

## Publicação (Cloudflare Pages)

1. Suba o código para um repositório Git.
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**.
3. Comando de build: `npm run build`. Diretório de saída: `dist`.
4. Em **Environment variables**, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. O arquivo `public/_redirects` já faz as rotas (`/admin`) funcionarem ao recarregar a página.
6. No Supabase, em **Authentication → URL Configuration**, informe o endereço publicado.

## Backup e recuperação (básico, até o Marco 4)

- Plano gratuito do Supabase: use **Database → Backups** quando disponível e, de forma regular, exporte as tabelas em **Table Editor → Export as CSV** (produtos, categorias, imagens, histórico de estoque).
- Com CLI: `supabase db dump -f backup.sql` (estrutura) e `supabase db dump --data-only -f dados.sql`.
- Fotos: baixe o conteúdo do bucket `product-images` periodicamente.
- Recuperação: reaplique as migrações em um projeto novo e importe `dados.sql`. A rotina guiada de exportação/recuperação entra no Marco 4.

## Banco de dados no Marco 2

**Nenhuma migration nova.** A view `catalog_products` (Marco 1) já expõe apenas produtos ativos e não arquivados, sem SKU. Não há tabela de pedidos, o RLS continua ligado em todas as tabelas e o visitante só lê `catalog_products` e `categories`.

## Regras de negócio já garantidas no banco

- Preço, preço promocional e quantidade validados por `CHECK` (promoção sempre menor que o preço; estoque nunca negativo).
- Dinheiro em `numeric(12,2)`; no front, todo cálculo é em centavos inteiros.
- Visitantes só leem a view `catalog_products` (sem SKU, sem dados internos) e apenas produtos ativos e não arquivados.
- Produtos não podem ser apagados (sem política de DELETE): usa-se desativar/arquivar.
- Toda mudança de `stock_quantity` gera linha imutável em `stock_movements` (data, tipo, produto, quantidade, origem, usuário).

## Estrutura

```
supabase/migrations/   SQL versionado
supabase/bootstrap_admin.sql
src/lib/               supabase, dinheiro, seleção, filtros, WhatsApp (mensagem/link), config, auth, acesso a dados
src/pages/             catálogo público
src/components/        vitrine, drawer da seleção, revisão (ConditionalReview/ReviewList)
src/admin/             painel (login, início, produtos)
src/styles/            global.css (vitrine) e admin.css
```

## Testes executados no Marco 2 (resultados reais)

Ambiente de verificação: Node 22, Linux.

| Verificação | Resultado |
|---|---|
| `npm test` (equivalente: `tsx --test src/lib/*.test.ts`) | **39 de 39 passaram** (dinheiro, seleção, sincronização de preço/estoque, filtros/pesquisa, mensagem e link do WhatsApp, renderização da revisão, verificações estáticas de segurança) |
| `tsc --noEmit` (primeira parte do `npm run build`) | **Passou**, sem erros |
| Navegador real (Chromium via Playwright, tela de celular 390 px) com Supabase **simulado por interceptação de rede**, 32 verificações: catálogo, busca, filtro, seleção, quantidades, revisão, mensagem/link, preço alterado, peça arquivada, falha de conexão, catálogo vazio, número ausente, ausência de qualquer escrita no banco | **32 de 32 passaram** |
| `vite build` completo | **NÃO foi possível executar** no ambiente de verificação (o `node_modules` enviado era de Windows e faltavam os binários nativos do `rollup`/`esbuild` para Linux, sem acesso à rede para instalá-los). O código foi empacotado com `esbuild` apenas como prova de que compila; **rode `npm run build` na sua máquina** |

Os testes de segurança de `src/lib/security.test.ts` são **estáticos** (leem as migrations e o código): conferem RLS em todas as tabelas, ausência de política de escrita para `anon`, view apenas de ativos/não arquivados, ausência de tabela de pedidos/vendas e de `service_role` no front, e que o código público nunca escreve no banco nem toca em estoque. Eles **não substituem** um teste contra o Supabase real.

## Limitações conhecidas

- Os testes do navegador usam um Supabase simulado; a leitura real (dados e fotos) depende do seu projeto e deve ser conferida manualmente em `npm run dev` (checklist: catálogo carrega com fotos, arquivar um produto o remove do catálogo, `/admin` continua funcionando).
- A garantia de “público não executa operações administrativas” vem do RLS do Marco 1; foi verificada por análise estática, não por tentativa real contra o banco.
- A seleção fica no `localStorage` do navegador (persiste também ao fechar e reabrir o navegador). Para esvaziar, use “Esvaziar seleção”.
- Abrir o WhatsApp não garante que a cliente enviou a mensagem; não há registro da solicitação no sistema (por decisão do Marco 2).
- Painel de pedidos/condicionais, vendas, fiado e financeiro seguem para marcos futuros.
