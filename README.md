# JAQUE PRATAS V4.1 — catálogo e gestão interna

React 18 + TypeScript + Vite 7 + Supabase, com React Router declarativo. Catálogo público e WhatsApp preservados. Gestão privada de clientes, estoque, condicionais físicas, vendas, pagamentos/estornos e relatórios CSV, com RPCs transacionais e histórico auditável.

## Executar localmente

Requer Node 24+ e npm. Instalar conforme lockfile:

```sh
npm ci
# Configure seu .env.local sem versioná-lo: veja .env.example.
npm run dev
```

Variáveis: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (pública), VITE_WHATSAPP_NUMBER. Nunca colocar chaves privilegiadas no navegador. O banco precisa das migrações compatíveis antes de usar os novos módulos. Esta entrega não aplica migrações no Supabase remoto nem publica o site.

## Validação

```sh
npm test
npm run build
npm run test:db
npm run test:browser
npm audit
```

Banco e navegador exigem permissão para sockets locais. Banco de teste é PostgreSQL nativo descartável; teste de navegador usa Chromium e transporte/Auth de fixture. Consulte docs/TEST_PLAN.md para pré-requisitos e limitações; eles não comprovam integração com Supabase completo.

## Documentação

- [Progresso atual](docs/PROJECT_PROGRESS.md) e [relatório técnico](docs/RELATORIO_TECNICO.md).
- [Arquitetura](docs/ARCHITECTURE.md), [regras implementadas](docs/BUSINESS_RULES.md) e [decisões](docs/DECISIONS.md).
- [Testes/roteiro manual](docs/TEST_PLAN.md) e [migrações, backup/restauração e publicação](docs/DEPLOYMENT.md).
- PROJECT_CONTEXT.md permanece como contexto comercial/histórico; CODEX_PROMPT_JAQUE_PRATAS_IMPLANTACAO_COMPLETA.md é a missão autorizada. A documentação antiga de Marco 2 foi preservada em docs/README_MARCO2_HISTORICO.md, sem representar o estado atual.

## Fluxos

/admin/clientes: cadastro, edição, arquivamento, auditoria e histórico. /admin/estoque: disponíveis/em condicional, entradas, ajustes, perdas e movimentos. /admin/condicionais: preparar entrega física, retornos/compras/perdas parciais e correções. /admin/vendas: venda direta, snapshots e devolução/cancelamento. /admin/recebimentos: parcial, quitação e estornos. /admin/relatorios: filtros e CSV. /admin/pedidos redireciona a vendas; WhatsApp não cria pedidos persistidos.

Preços: cartão pelo preço vigente; Pix com 10% acumulativo sobre promoção e arredondamento por unidade. Parcelamento por operadora não implica crédito concedido pela loja. Recebimento, vendido e saldo são separados; não há lucro fictício. Em retornos de venda, confirmação física e devolução financeira excedente são obrigatórias. Nenhum reembolso é executado em banco/operadora pelo site: registra-se o que a proprietária confirmou.

## Exclusão segura V4.1

Clientes e peças têm ações de arquivar/reativar e excluir, com confirmação nominal. O banco decide se a exclusão é elegível; históricos e fotos vinculadas bloqueiam e oferecem arquivamento. Auditoria não é apagada. Esta versão não exclui objetos do Storage automaticamente. Aplicar a migração incremental V4.1 somente após V4.0 em ambiente autorizado; detalhes em docs/V4_1_EXCLUSAO.md.
