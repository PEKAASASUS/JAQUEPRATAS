# Prompt inicial para Codex — JAQUE PRATAS V4.0

Você é o engenheiro principal do projeto JAQUE PRATAS, trabalhando no workspace real do VS Code. **Antes de qualquer alteração, leia integralmente `PROJECT_CONTEXT.md` na raiz do repositório.** Esse arquivo é a fonte de contexto de produto, decisões comerciais, arquitetura conhecida, riscos e sequência de trabalho. Leia também `README.md`, `package.json`, as migrações SQL e o código pertinente. Não substitua inspeção do workspace por suposições do documento.

## Sua missão

Evoluir a base Marco 2 existente para um sistema de catálogo público + gestão interna (estoque, clientes, condicionais, vendas, pagamentos, contas a receber e relatórios), sem recriar o projeto, sem quebrar o catálogo, sem expor dados financeiros e sem inventar resultados. O domínio futuro é `jaquepratas.com.br`, com GitHub privado e Cloudflare Pages; **não publique nem faça push sem autorização**.

## Instruções permanentes

1. Preserve a arquitetura React/TypeScript/Vite/Supabase e a identidade visual existente. Reutilize serviços e funções, especialmente `src/lib/money.ts`.
2. Respeite rigorosamente as regras de `PROJECT_CONTEXT.md`, em especial: **Pix com 10% acumulativo sobre preço promocional válido; cartão pelo preço aplicável sem desconto Pix**.
3. Solicitação pública pelo WhatsApp não cria venda, reserva, dívida, condicional administrativa nem baixa estoque.
4. Operações financeiras e de estoque futuras exigem transações atômicas, autorização no backend, RLS, proteção contra concorrência e idempotência, histórico imutável ou reversões auditáveis.
5. Não altere banco de produção, não rode resets, não exclua dados, não faça push/deploy, não modifique DNS nem exponha `.env.local` sem autorização explícita.
6. Não crie apenas telas demonstrativas: cada funcionalidade deve ter persistência real e testes adequados para ser considerada concluída.
7. Não use `npm audit fix --force` automaticamente; reporte e trate vulnerabilidades com mudanças compatíveis e testadas.
8. Nunca afirme que testes, migrações ou integração passaram se não foram executados/verificados.

## Procedimento desta execução — Marco A obrigatório

### Fase 1 — Auditoria

- Leia `PROJECT_CONTEXT.md` **inteiro** e resuma as regras críticas que regerão a implementação.
- Inspecione `git status`, árvore do projeto, `README.md`, `package.json`, `.gitignore`, rotas, componentes, funções de preços, WhatsApp, testes e migrações SQL.
- Execute `npm test` e `npm run build` no ambiente disponível; se dependências faltarem, tente instalação segura conforme lockfile. Registre falhas reais e não destrua mudanças locais.
- Crie `AGENTS.md` com instruções sucintas e persistentes para futuras sessões, incluindo **leitura obrigatória de `PROJECT_CONTEXT.md`** antes de trabalhar.
- Crie `docs/PROGRESS.md` para registrar o diagnóstico, o marco atual e evidências dos testes. Não duplique o contexto integral nesses arquivos.

### Fase 2 — Implementar desconto Pix

- Localize a fonte atual de preços (`price`, `promo_price`, `current_price`) e determine como promoções válidas são tratadas.
- Centralize o cálculo em centavos inteiros ou decimal exato. Sem promoção: cartão = preço normal; Pix = 90% do normal. Com promoção válida: cartão = preço promocional; Pix = 90% do promocional. Arredonde de maneira consistente para centavos.
- Não adicione coluna `pix_price` ao banco. Não altere a migração existente para este marco.
- Atualize cards, detalhes, revisão, seleção e mensagem WhatsApp para mostrar valores coerentes, inclusive totais para múltiplas unidades.
- Mantenha a revalidação de preço e estoque antes de gerar a mensagem. Não prometa reserva nem confirmação de venda.
- Preserve CSS/identidade e fluxos de login, administração, imagens e catálogo.

### Fase 3 — Testar e documentar

- Acrescente testes para preço normal, promoção, Pix acumulativo, centavos/arredondamento, quantidades, revalidação e consistência da mensagem WhatsApp.
- Rode `npm test`, `npm run build` e os testes adicionais cabíveis. Corrija regressões introduzidas.
- Atualize `docs/PROGRESS.md` com arquivos modificados, decisões, resultados verificáveis, pendências e riscos.
- Informe o que foi implementado e o que ainda não foi validado.

**Limite desta execução:** conclua e valide o **Marco A**. Depois **pare e solicite minha aprovação antes de iniciar o Marco B**, que envolverá modelagem de clientes, condicionais, vendas, pagamentos, migrações e RLS. Não apresente apenas um plano; realize as alterações de código do Marco A.

## Marcos futuros (não implementar nesta execução)

- B: migrações SQL, autorização e testes de integração em Supabase isolado.
- C: estoque transacional e histórico.
- D: cadastro e histórico interno de clientes.
- E: condicionais com entrega física, retorno e compra parcial.
- F: vendas diretas/condicionais e snapshots de preços.
- G: pagamentos, estornos, saldo devedor e distinção entre cartão e fiado.
- H: dashboard financeiro real, relatórios, exportações.
- I: UX, backup/restauração, segurança e preparação para publicação.

Em todos os marcos, releia `PROJECT_CONTEXT.md` e `docs/PROGRESS.md` antes de agir, compare com o estado real do repositório e registre as decisões tomadas.
