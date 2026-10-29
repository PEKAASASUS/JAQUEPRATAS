# Aplicação, backup e preparação de publicação

Nada foi publicado, enviado ao GitHub, aplicado em produção ou alterado no DNS nesta missão.

## Requisitos e variáveis

Node 24+ (`.nvmrc`), npm, Supabase configurado. Frontend continua usando somente VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (pública) e VITE_WHATSAPP_NUMBER. Nunca colocar chave privilegiada no frontend ou no Git. .env.local existente foi preservado sem leitura/exposição. Reiniciar servidor após alterar variáveis.

## Migrações em ambiente autorizado

1. Exportar banco e Storage antes de qualquer alteração num ambiente com dados a preservar. Confirmar identificação do projeto exclusivo de testes.
2. Rodar `supabase/verify_installation.sql` (somente leitura) e comparar o schema. Conferir histórico de migrations, caso exista, e estrutura real: o proprietário aplicou B manualmente anteriormente.
3. Banco novo: aplicar `20260101000000_fundacao.sql`, depois `20261028000000_gestao_base.sql`, depois `20261029000000_operacoes.sql`.
4. Banco que já tem fundação e B compatíveis: aplicar **somente** `20261029000000_operacoes.sql`. Não reaplicar fundação nem B. Se houver estrutura parcial/divergente, parar aplicação nesse alvo e preparar migração de reconciliação, sem DROP CASCADE ou reset.
5. As três migrations são versionadas e usam transações nas etapas de gestão. Não foram transformadas em scripts que ignoram divergências com IF NOT EXISTS.
6. Conferir saída e executar `supabase/tests_full_sql_editor.sql` inteiro num banco de teste. Em seguida seguir docs/TEST_PLAN.md para API/Auth/Storage reais. Só depois planejar produção com autorização específica.
7. Supabase CLI pode gerenciar aplicações futuras, mas requer histórico reconciliado antes de db push. Esta missão não executou db push/link/reset.

Admin: fluxo original de Auth + bootstrap_admin.sql é preservado. Nunca promover usuário real como efeito de teste. Fixtures criam usuários fictícios apenas em transação revertida ou cluster descartável.

## Backup e restauração de banco e imagens

- Banco: dump de schema e dados via ferramenta PostgreSQL/Supabase compatível, com versão e data, sem credenciais em comandos versionados. Inclua categorias, produtos, imagens, admin_users, stock_movements e todas as tabelas de gestão/eventos/chaves de operação. Preserve vínculos Auth e seus identificadores conforme os mecanismos de backup suportados pelo provedor; CSV isolado não é backup completo de Auth ou do banco.
- Storage: baixar todos os objetos de product-images preservando seus caminhos, tipos e checksums. Dump SQL não contém os bytes das imagens.
- Guardar backups fora do repositório em local protegido. Os ZIPs de código desta missão não são backup de dados do Supabase.
- Testar restauração num projeto isolado: schema compatível, dados e relações, usuários/autorização, bucket/políticas, objetos com mesmos caminhos, catálogo/imagens, histórico e saldos. Documentar quantidade de registros/objetos e checksums. Só declarar restauração validada após executá-la.
- Rollback: preferir correção incremental. Antes de novas operações, manter código anterior como possibilidade; depois de lançamentos, não eliminar tabelas ou reescrever histórico para voltar versão. Estornos/reversões são eventos. Uma restauração de backup exige janela autorizada e pode perder alterações posteriores: não foi executada aqui.

## GitHub privado e Cloudflare Pages — somente preparação

- Confirmar .gitignore e revisar staged files, sem .env.local, node_modules, dist, dados de clientes ou ZIPs/backups sensíveis. Criar repositório privado apenas quando autorizado; não houve Git válido no checkout nem push desta missão.
- Cloudflare Pages: build `npm run build`, saída `dist`, runtime Node 24 e variáveis VITE_ do alvo correto. public/_redirects mantém SPA fallback. Configurar Supabase Auth URL/redirects para os endereços efetivos.
- Antes de conectar jaquepratas.com.br, verificar posse do domínio/projeto e obter autorização; configurar domínio personalizado/HTTPS e DNS pelos procedimentos do provedor. Nada foi presumido como já configurado.
- Smoke: catálogo, fotos, promoção/Pix, WhatsApp, reload em /admin/clientes, login/logout, usuário não autorizado, operação fictícia somente no banco de testes e leitura financeira privada. Não executar smoke com lançamentos reais em produção.

## Limitações conhecidas

Não foi validado Supabase completo remoto, envio WhatsApp, restauração de banco/Storage, nem hospedagem/domínio. Gestão usa snapshot sem paginação e lock global; reavaliar com crescimento. Não há cálculo de lucro sem custos confiáveis, automação de repasse de cartão nem integração de estorno bancário.

## Migração V4.1

Aplicar `20261029010000_exclusao_segura_v41.sql` somente após fundação, B e operações V4.0 compatíveis. A migração cria um registro permanente de identidades de auditoria, preserva os registros existentes e troca a referência da auditoria; não exclui cliente, produto, evento ou arquivo. Fazer backup e conferir schema/histórico do alvo antes de qualquer aplicação. Não foi aplicada em Supabase remoto nesta sessão.

A RPC pública admin_execute mantém a assinatura, enquanto sua implementação anterior passa a admin_execute_v40 (sem EXECUTE para a API). Código e banco precisam da V4.1 para habilitar os novos modais; erro de função de inspeção ausente deve ser resolvido aplicando a migração no ambiente autorizado. Não tentar reaplicar migrações anteriores.

Incluir customer_audit_subjects e operation_requests no backup/restauração. Não tratar a identidade histórica permanente como cliente ativo nem removê-la em uma limpeza de cadastros. Excluir cadastro não significa apagar dados de auditoria; isso não é uma funcionalidade de eliminação de dados pessoais.
