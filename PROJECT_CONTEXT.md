# JAQUE PRATAS — Contexto permanente do projeto

> Fonte: inspeção do `jackpratas.zip` fornecido pelo proprietário em outubro de 2026 e decisões comerciais explicitadas na conversa. **Este documento descreve a base recebida, não comprova o estado atual do workspace nem do Supabase remoto.** O Codex deve conferir código, migrações e dados antes de agir.

## 1. Objetivo do produto

JAQUE PRATAS é um catálogo público de joias de prata e um sistema administrativo para a proprietária. Clientes navegam sem criar conta, escolhem produtos e encaminham uma **solicitação de condicional** pelo WhatsApp. A proprietária administra produtos, estoque, saídas físicas, retornos, vendas, recebimentos e clientes. O sistema deve ser simples de usar, seguro e auditável; não deve virar um ERP complexo.

Domínio adquirido: `jaquepratas.com.br`. Hospedagem pretendida: Cloudflare Pages, com código no GitHub privado. **Não presumir que GitHub, hospedagem ou DNS já foram configurados.**

## 2. Tecnologia verificada no ZIP

- React 18, TypeScript, Vite 5, React Router 6.
- Supabase JS 2: Auth, PostgreSQL, Storage e RLS.
- Testes via `tsx --test src/lib/*.test.ts`.
- Scripts: `npm run dev`, `npm test`, `npm run build` (`tsc --noEmit && vite build`), `npm run preview`.
- Variáveis esperadas: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_NUMBER`.
- O arquivo `.env.local` está presente no ZIP recebido. **Nunca imprimir seus valores, versioná-lo ou incluí-lo em relatórios.** Se houver exposição real de segredo, reportar o risco e orientar rotação adequada.

## 3. Arquivos-chave verificados

- `src/App.tsx`: rotas públicas `/`, login `/admin/login`, painel `/admin`, produtos `/admin/produtos`, placeholders `/admin/pedidos` e `/admin/condicionais`.
- `src/pages/CatalogPage.tsx`: catálogo público.
- `src/components/Price.tsx`, `ProductDetail.tsx`, `SelectionDrawer.tsx`, `ReviewList.tsx`, `ConditionalReview.tsx`: apresentação e revisão.
- `src/lib/money.ts`: conversões e formatação em centavos inteiros; **reutilizar**.
- `src/lib/catalog.ts`, `selection.ts`, `SelectionContext.tsx`, `whatsapp.ts`: consulta, seleção e solicitação.
- `src/lib/adminProducts.ts`, `auth.tsx`, `supabase.ts`, `types.ts`: administração e integração.
- `src/admin/`: login, dashboard, formulário/listagem de produtos, layout, placeholders.
- `src/styles/global.css`, `admin.css`: estilos existentes.
- `supabase/migrations/20260101000000_fundacao.sql`: migração de fundação.
- `supabase/bootstrap_admin.sql`: autorização inicial de administrador.
- `README.md`: fluxos e configuração da base Marco 2.

## 4. Funcionalidades presentes na base recebida

Segundo código e README, há catálogo público com produtos ativos, busca/categorias, detalhes, imagens, promoções e disponibilidade; seleção local de peças; revisão e revalidação antes de abrir o WhatsApp; login administrativo, gestão de produtos e imagens. **O WhatsApp abre uma mensagem preparada; não grava pedido no banco nem garante envio.** A revisão é somente leitura. Testes existentes incluem dinheiro, seleção, filtros, revisão, WhatsApp e segurança estática. O usuário relatou funcionamento local com Supabase real e WhatsApp; ainda assim revalidar no workspace.

**Ausentes na base recebida:** cadastro interno de clientes, condicionais administrativas persistidas, vendas, pagamentos, contas a receber, relatórios financeiros reais, exportação/restauração completa. Indicadores financeiros do dashboard são placeholders.

## 5. Banco existente — não duplicar

A migração inicial cria `admin_users`, `categories`, `products`, `product_images`, `stock_movements`, view pública `catalog_products`, além de mecanismos de Storage, triggers e RLS. `products` contém `price numeric(12,2)`, `promo_price numeric(12,2)`, `stock_quantity` e estados de publicação/arquivamento. `catalog_products` expõe `current_price` e `available_quantity` para o catálogo. `stock_movements` é alimentada por trigger quando `stock_quantity` muda; sua enumeração de `movement_type` na fundação é limitada e **deve ser estendida com cuidado** antes de criar novos tipos. Não inserir histórico duplicado manualmente se o trigger já o gera.

A autorização administrativa utiliza Supabase Auth e `admin_users`/`is_admin()`. Inspecionar permissões de views, funções `SECURITY DEFINER`, RLS e políticas do Storage antes de qualquer alteração. Nunca usar `service_role` no navegador.

## 6. Regras comerciais decididas

### Preços

- Preço normal: `price`.
- Preço promocional válido: `promo_price`, quando aplicável; preservar validações existentes.
- Preço aplicável: promocional válido, senão normal.
- Cartão: **preço aplicável integral**, inclusive se parcelado; não inventar número de parcelas, taxas ou juros.
- Pix: **10% de desconto sobre o preço aplicável, acumulativo com promoção**.
- Exemplo: R$ 200 normal, R$ 160 promocional => cartão R$ 160, Pix R$ 144.
- Fazer aritmética monetária precisa em centavos/decimal; definir e testar arredondamento.
- Não armazenar `pix_price` redundante em `products`.
- Em venda confirmada, preservar snapshot de preço e descontos; mudanças futuras do catálogo não alteram vendas antigas.

### Solicitação pública x operação real

- Seleção/WhatsApp = **intenção de atendimento**, não venda, não reserva, não saída física, não dívida e não pagamento.
- Apenas a proprietária confirma a entrega física de peças em condicional, momento em que ficam indisponíveis para outras vendas.
- Uma condicional admite compras parciais, devoluções parciais e pendências, sempre com trilha auditável.
- Venda direta ou decorrente de condicional registra valores históricos e movimentação de estoque coerente.
- Pagamentos podem ser parciais. Separar venda, valor recebido e saldo a receber.
- Parcelamento por operadora de cartão **não equivale automaticamente** a dívida da cliente com a loja.
- Devoluções, cancelamentos, ajustes e estornos devem ser reversões auditáveis, nunca exclusão silenciosa.

### Gestão

A proprietária precisa consultar quem levou peças, o que saiu/voltou, o que foi vendido, quanto entrou, quanto falta receber e histórico por cliente. Lucro só pode ser calculado com custos e despesas confiáveis; não chamar faturamento de lucro.

## 7. Experiência visual

Identidade: **JAQUE PRATAS**, luxo discreto, elegante, minimalista, paleta neutra de grafite, prata, branco e bege/cinza conforme estilos reais do projeto e logo oficial. **Preservar o visual existente e os assets; não inventar logo.** Corrigir textos de marca quando adequado sem renomear identificadores técnicos que comprometam compatibilidade. Painel limpo, funcional, responsivo, sem gráficos falsos.

## 8. Restrições de engenharia e segurança

1. Inspecionar estado atual de Git e arquivos antes de editar; não sobrescrever trabalho do usuário.
2. Fazer alterações incrementais, com testes por marco.
3. Não reescrever a migração de fundação já potencialmente aplicada; criar novas migrações idempotentes quando apropriado e documentar aplicação.
4. Não aplicar migrações, `db reset`, exclusões, deploy, push remoto ou alterações DNS em ambiente real sem aprovação explícita.
5. Validar permissões no banco; RLS para dados de clientes e financeiros; evitar `service_role` no frontend.
6. Operações críticas de estoque/vendas/pagamentos devem ser transacionais, protegidas contra concorrência e duplicação.
7. Não confiar em totais fornecidos pelo frontend; backend deve validar.
8. Preservar logs e registros financeiros; auditoria para ajustes e estornos.
9. `node_modules`, `dist`, `.env.local` e segredos não entram no repositório.
10. Não declarar integração real testada se apenas testes com mocks foram executados.

## 9. Ordem de implementação recomendada

- **Marco A:** cálculo Pix centralizado, preços no catálogo/revisão/WhatsApp, testes e build.
- **Marco B:** modelagem incremental do banco, autorização e testes de integração em ambiente isolado.
- **Marco C:** estoque e movimentações.
- **Marco D:** clientes internos.
- **Marco E:** condicionais físicas e retornos.
- **Marco F:** vendas e histórico de preços.
- **Marco G:** pagamentos parciais, estornos e contas a receber.
- **Marco H:** indicadores reais, relatórios e exportação.
- **Marco I:** revisão UX, segurança, backup/restauração, preparação para GitHub/Cloudflare.

**Regra de execução:** implementar e validar Marco A primeiro; apresentar resultado e solicitar autorização antes de Marco B e de qualquer alteração de banco real.

## 10. Definição de pronto e documentação de continuidade

Para cada marco, registrar arquivos alterados, migrações criadas, testes efetivamente executados e resultados, limitações e próximo passo em `docs/PROGRESS.md`. `npm test` e `npm run build` devem passar. Testes com mocks são úteis, mas não comprovam RLS/integração real. Não afirmar implantação sem deploy ou migração efetivamente realizada.

Se houver divergência entre este documento e o código, **o código define o estado técnico atual**; decisões comerciais explícitas deste documento continuam sendo requisitos, e ambiguidades comerciais devem ser confirmadas com o proprietário.
