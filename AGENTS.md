# Instruções permanentes — JAQUE PRATAS

- Ler integralmente PROJECT_CONTEXT.md e CODEX_PROMPT_JAQUE_PRATAS_IMPLANTACAO_COMPLETA.md antes de trabalhar. Consultar docs/PROJECT_PROGRESS.md, docs/DECISIONS.md e os testes; conferir código e estado Git sem presumir o remoto.
- A autorização atual de 29/10/2026 é a missão integral, sem pausas entre marcos. Substitui a retirada anterior do Marco B. Não alterar produção/dados reais, promover administradores reais, fazer push/deploy/DNS ou resets reais sem autorização específica.
- Preservar React 18, TypeScript, Vite, Supabase, assets e identidade. Node 24+; instalar conforme package-lock.json. Preços em money.ts: Pix 10% acumulativo sobre promoção, arredondado por unidade; cartão integral.
- WhatsApp público é solicitação; não reserva estoque ou grava venda/financeiro. Somente catálogo e categorias são públicos.
- Operações privadas passam por admin_execute com chave de idempotência; não escrever diretamente em tabelas de gestão nem atualizar stock_quantity por formulário de edição comum. Não duplicar stock_movements: o trigger gera o histórico.
- Não reescrever migrações potencialmente aplicadas. A B foi recuperada do backup em bytes; operações são uma migração seguinte. Checar schema/histórico antes de aplicar em qualquer alvo.
- Preservar eventos imutáveis, snapshots, autorização no backend e reversões auditáveis. Sem crédito implícito por cartão parcelado ou lucro sem custos confiáveis.
- Nunca imprimir, copiar para fixtures ou versionar .env.local, tokens/chaves privadas ou dados reais. Backups de código não são backups do banco/Storage.
- Validar npm test, npm run test:db, npm run test:browser, npm run build e npm audit conforme mudança. Testes Chromium/PostgreSQL com transporte/Auth de fixture não comprovam PostgREST/Auth/Storage reais. Documentar resultados reais e pendências em docs/PROJECT_PROGRESS.md.
- V4.1 permite exclusão definitiva somente pela RPC protegida e apenas sem dependências; customer_audit_subjects preserva identidades auditadas. Nunca remover auditoria/movimentos/vendas em cascata. Fotos vinculadas bloqueiam exclusão e Storage não é limpo automaticamente. Testes de exclusão devem usar fixtures, nunca cadastros existentes reais.
