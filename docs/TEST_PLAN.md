# Testes reproduzíveis e roteiro de aceite

Use Node 24+ e `npm ci`. Não copiar credenciais reais para fixtures.

```sh
npm test
npm run build
npm run test:db
npx playwright install chromium  # se não houver Chromium/Chrome compatível instalado
npm run test:browser
npm audit
```

Banco: embedded-postgres fixa PostgreSQL 17.10 e cria cluster novo no diretório temporário, escuta só em loopback, senha aleatória e porta livre. Limpa o cluster ao terminar. Não aceita URL externa, não lê .env.local e não cria usuário do sistema. O postinstall de @embedded-postgres/linux-x64 reconstitui links de bibliotecas; allowScripts inclui somente a versão inspecionada. Outras plataformas podem exigir a aprovação equivalente pelo gerenciador.

`test:db` executa testes de migrações, RLS/grants, integridade, auditoria, preços, idempotência, estoque, condicional, venda, cancelamento, pagamentos, reversões e duas conexões concorrentes pela última unidade. O caso de navegador é excluído por padrão e executado separadamente por `test:browser`.

`test:browser` abre Vite local + Chromium e usa PostgreSQL nativo da fixture. Transporte HTTP/Auth são interceptados de forma controlada, somente para o host fictício de teste. O produto continua usando o SDK Supabase. Testa catálogo/revisão, cadastro, ajuste, entrega/retorno/compra parcial, Pix, quitação, cancelamento, CSV, erro de rede, permissão e viewport de 390 px. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite apontar um Chrome local; sem ele usa /usr/bin/google-chrome se disponível ou o Chromium instalado pelo Playwright. Capturas usam apenas clientes fictícios.

A suíte unitária preserva todos os testes anteriores e acrescenta CSV contra fórmulas e limites de datas. Os testes de segurança de fonte são proteção estática e não substituem o banco.

## Supabase completo — pendente de execução autorizada

No Supabase exclusivo de testes, conferir o schema, aplicar somente migrações ausentes na ordem documentada e executar **todo** `supabase/tests_full_sql_editor.sql`. Ele não usa pg_temp ou coletor pgTAP: qualquer asserção falha com erro e a saída final única informa aprovação. Fixtures e efeitos são revertidos. O script foi executado em PostgreSQL com contrato Auth de teste; precisa de validação no Supabase real.

Roteiro manual de ponta a ponta no Supabase isolado:

1. Visitante: catálogo/filtro/detalhe/imagem; promoção/Pix; selecionar duas unidades; revisão; abrir mensagem WhatsApp sem enviar e verificar valores. Confirmar que nada foi gravado.
2. Usuário comum autenticado: acesso administrativo negado; tentar SELECT privado e RPC com token comum, ambos bloqueados. Token anon não chama RPC de gestão.
3. Administradora: cadastrar cliente fictícia, editar telefone, consultar auditoria e arquivar/reativar. Novas vendas preservam nome antigo após edição.
4. Produto: upload, foto principal, edição/arquivamento preservados. Quantidade existente só é ajustada em Estoque com motivo; entrada +5/perda -1 produz um movimento por mudança.
5. Entregar três peças; devolver uma e registrar perda de uma; comprar a última com Pix. Conferir disponível, pendente e estados. Tentar retornar uma quarta unidade: bloquear.
6. Venda direta: confirmar duas unidades por cartão à vista. Não cria parcelas a receber; quitação imediata. Tentar total recebido divergente: bloquear e não baixar estoque.
7. Venda com crédito da loja: receber parcialmente, quitar, tentar exceder saldo, estornar parcialmente e conferir saldo reaberto. Tentativas inválidas não geram linhas.
8. Devolver parcialmente venda quitada com confirmação física/financeira: repõe só a quantidade correspondente e registra estorno excedente. Cancelar restante: saldo zero e original preservado.
9. Duas abas pela última unidade: só uma confirma. Repetir a mesma requisição com mesma chave: mesmo resultado; alterar payload com essa chave: bloquear.
10. Relatórios: datas de venda/recebimento/estorno separadas, filtros e CSV; abrir CSV com nome que começa por '=' e confirmar texto seguro. Não chamar nenhum indicador de lucro.
11. Rede: interromper resposta de uma RPC depois da confirmação, repetir dados e conferir idempotência. Atualizar página e confirmar persistência real.
12. Mobile e teclado: navegar menu, abrir/fechar diálogos, validar mensagens e foco, sem overflow. Nenhum dado real em captura.

Registrar evidências reais de PostgREST/JWT, Auth e Storage antes de considerar integração Supabase/publicação validadas. Não é um teste de produção.

## V4.1 — cenários adicionais

A suíte PostgreSQL inclui cliente elegível com auditoria de criação preservada, cliente bloqueado por venda/condicional/auditoria UPDATE, arquivar/reativar sem sobrescrever dados, peça elegível, bloqueios de venda/condicional/movimentos/fotos, visitante/login comum, DELETE direto, replay e payload divergente. Exercita ainda FK desconhecida que tentaria CASCADE, rollback após DELETE quando o ledger falha, duas ordens de concorrência com entrega de condicional e alteração de nome após a confirmação prévia.

O fluxo Chromium também cria/exclui cliente e peça descartáveis, confere confirmação nominal e botão desabilitado antes de marcar o aceite, mostra exclusão bloqueada com alternativa Arquivar, arquiva/reativa cliente e preserva os fluxos de catálogo/estoque/vendas/CSV. Transporte/Auth são de teste; SQL é PostgreSQL real isolado. Capturas browser-v41-delete.png e browser-v41-blocked.png contêm somente fixtures.

Em Supabase exclusivo de testes, após aplicar V4.1, repetir esses cenários e conferir que nenhuma imagem referenciada é removida. A exclusão de peça com fotos deve ser recusada; clientes/peças usados devem oferecer arquivamento. Não usar dados reais para testar exclusão.
