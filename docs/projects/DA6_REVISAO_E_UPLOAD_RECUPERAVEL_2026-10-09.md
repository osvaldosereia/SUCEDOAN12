# DA6 — Rodada: revisão humana e upload recuperável (2026-10-09)

**Repositório:** `osvaldosereia/SUCEDOAN12`  
**Branch:** `agent/gondola-labels-balance-20261009`  
**PR:** #987 (rascunho; não mesclado)  
**Publicação:** PENDENTE. Nenhum deploy do Edge runtime nem alteração da `main` nesta rodada.

## Implementado na branch

- `supabase/migrations/20261009140500_da6_manual_review_audit_v1.sql`: trilha `inventory_label_review_events` com RLS e RPC `inventory_label_review_count_v1` restrita a service_role. Autenticação do operador validada no gateway; apenas criador da fotografia com conta Admin ativa e função diferente de `viewer` pode revisar. Aprovar/rejeitar/corrigir quantidade 0–99, registrar motivo, autor, antes/depois. Slot sem leitura somente corrigível se tiver erro óptico daquele slot. Nunca altera `products`, estoque nem Bling. Registros finalizados não podem ser regravados silenciosamente.
- `supabase/functions/admin-products-live-v1/inventory-label-photo-api.ts`: nova ação `inventory_label_photo_review`; `inventory_label_batch_status` retorna as contagens verificáveis do lote por fotografia.
- `supabase/functions/admin-products-live-v1/index.ts`: inclusão em allowlist, proteção de escrita e roteador autenticado.
- `vitrine/admin/inventory-label-photo-review.js`: conferência explícita para até seis posições, com dados lidos, botões aprovar/rejeitar, quantidade numérica e justificativa para correção; modal de confirmação; texto escapado antes de inserir no HTML.
- `vitrine/admin/inventory-label-photo-tab.js` e `vitrine/admin/index.html`: disponibilizam revisão na aba de fotos; não ligam câmera automaticamente ao abrir balanço.
- `vitrine/admin/inventory-label-photo-upload.js` + `inventory-label-photo-api.ts`: upload com SHA-256 recuperável. Arquivo reservado e não enviado recebe novo URL assinado; arquivo enviado mas não confirmado retorna `needs_confirmation` e é confirmado sem PUT duplicado; arquivo já na fila continua idempotente.
- `tests/da6-review-upload-recovery.test.cjs`: oito cenários de interface e recuperação de upload para executar via Node CI.

## Evidências técnicas e limitações
- Teste em V8 com código real da branch: 4/4 cenários de upload (novo, reenvio, aguardando confirmação, já na fila) passaram.
- Teste V8 do HTML de revisão: markup válido, ações somente para pendentes, escape de conteúdo malicioso e criação de controles para slot com erro.
- Sintaxe JS de `inventory-label-photo-review.js` e `inventory-label-photo-tab.js` validada.
- Testes não substituem integração com Storage real, PostgreSQL 17, Deno Edge ou impressora.
- **Migração de revisão NÃO aplicada em produção.** Precisa validação PostgreSQL transacional e controle de versão antes de deploy. O endpoint existirá somente quando gateway DA6 for publicado após homologação.
- Edge Function publicada ainda é versão 158; não possui as rotas DA6. Cron do banco já existe, mas fotos não poderão ser recebidas pelo novo endpoint até deploy testado.
- Toda contagem histórica permanece segregada: revisão `approved` não promove nem sincroniza automaticamente saldo em Bling.
- Não publicar/mesclar até teste completo de `ImageMagick WASM` + `jsQR` em Supabase Edge, contrato de URL assinada, 100 fotos, câmera/impressora 203dpi, erro/retry concorrente, regressão do balanço A4 e observabilidade.

## Próxima rodada
1. Revalidar `main`, branch, CI do PR #987 e referências do worker.
2. Homologar compilação Edge `npm:@imagemagick/magick-wasm@0.0.44`, RGBA e jsQR em ambiente controlado; não publicar globalmente sem gate.
3. Executar migrations de revisão apenas após testes de sintaxe/transação/ACL em PostgreSQL 17 (sem mexer em estoque).
4. Provar ponta a ponta com fotos reais: upload assinado, fechar celular após upload, cron, worker, status, revisão e recuperação de falhas.
5. Corrigir qualquer problema encontrado e homologar impressão de 10x15; atualizar handoff e PR #987.

