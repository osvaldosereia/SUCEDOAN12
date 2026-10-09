# DA6 — Rodada de implementação e auditoria · 09/10/2026

## Rastreabilidade
- Repositório: `osvaldosereia/SUCEDOAN12`
- Branch isolada: `agent/gondola-labels-balance-20261009`
- Estado **não publicado na main**. Código do gateway atualizado apenas na branch; a versão Edge em produção continua separada.
- Fonte canônica: Supabase `ssbesxgaijknwsjbsbcz`; sem IA e sem gravação automática no Bling.

## Entregas desta rodada
1. **Banco de dados canônico (aplicado com sucesso):**
   - RPC `inventory_label_claim_next`: reserva concorrente por `FOR UPDATE SKIP LOCKED`, timeout, limite total 3.
   - RPC `inventory_label_fail_photo`: falha, atrasos de 15/60 s e erro terminal após 3 tentativas.
   - RPC `inventory_label_finish_photo`: grava contagens somente como `pending_review`, verifica produto, intervalo 0–99, slots 1–6, unicidade de série+slot.
   - Credencial de worker gerada internamente pelo Vault `da6_label_worker_key_v1`; protegida por RPC de serviço.
   - `da6_worker_dispatch_tick_v1` e cron `inventory-label-worker-da6-v1` ativo a cada minuto **somente despacha** quando existe trabalho pendente.
   - Migrações espelhadas em `supabase/migrations/20261009112000_da6_worker_queue_rpc.sql`, `20261009130000_da6_worker_vault_secret_v1.sql` e `20261009133000_da6_worker_dispatch_cron_v1.sql`.
2. **Frontend:**
   - `inventory-label-photo-upload.js`: 1–100 fotos, tipo e tamanho, SHA256, upload assinado com PUT multipart, confirmação por arquivo, erro individual. Não libera o celular até confirmar o envio de todas as fotos.
   - `inventory-label-photo-tab.js` + CSS: aba Balanço › Etiquetas por foto, status de lotes, erros e progresso com consulta a cada 15s somente enquanto a aba estiver ativa.
   - `vitrine/admin/index.html`: carregamento da nova aba e ponte para controlar câmera; Balanço A4 existente preservado.
   - `product-label-print.css`: seis campos OMR em posições geométricas fixas em milímetros na etiqueta 100×150.
3. **Gateway de Admin (somente na branch):** `inventory-label-photo-api.ts` implementa lote, reserva de upload, confirmação real no Storage, lista de lotes e status com auth/ownership. `index.ts` roteia as operações.
4. **Worker (somente na branch):** `inventory-label-worker.ts` + `inventory-label-worker-omr.ts`: código de leitura QR/OMR determinístico, JPEG/PNG/WebP usando ImageMagick WASM, SHA256 real, uma foto por execução interna, até 3 tentativas ao longo das rodadas, resultados pendentes de revisão; rota interna com chave Vault.
5. **Testes adicionados à branch:** `tests/da6-six-balances.test.cjs`, `tests/da6-signed-upload.test.cjs`.

## Verificações realizadas
- Leitura em imagem sintética 1000×1500: quantidades `[0,1,7,10,23,99]`, QR e UUID corretos, sem erros; teste de duplicidade de marca.
- Cinco módulos browser passaram na validação sintática JS.
- Mock de upload assinado: PUT multipart, cacheControl, bloqueio de URL de outro domínio/bucket e limites de arquivo — aprovado.
- No Supabase: bucket `inventory-label-photos` privado, 0 lotes, 0 fotos, 0 contagens, cron ativo `* * * * *`, despacho manual com fila vazia `queue_empty`.

## Limitações e próximo passo obrigatório
- **Ainda NÃO publicado nem homologado.** O backend da branch não substitui a Edge Function ativa.
- Antes de qualquer deploy: testar compilação e execução reais do decoder WASM na Supabase Edge, confrontar os milímetros do layout com etiquetas fisicamente impressas (203dpi), fotos reais giradas, sombras, QR ruim e códigos duplicados, verificar custo/memória/timeouts; testes unitários sintéticos NÃO bastam.
- Homologar fluxo ponta a ponta 100 fotos em telefone real: upload persistente, celular fechado após a confirmação, cron → worker → Storage → OMR → histórico, retentativas e recuperação após interrupções.
- Implementar/revisar **UI de revisão manual de casos incertos** e liberação explícita/segura de contagens antes de qualquer eventual `inventory_balance_commit`. A fila não altera estoque/Bl ing e resultados históricos não podem sobrescrever estoque vigente.
- Validar conflito com `main` antes de PR e publicar só quando puder garantir estabilidade do site.
- Não desativar automação horária enquanto existirem pendências.

## Observação de segurança
Não registrar/retornar segredo de Vault ou credenciais do Storage/Meta/Bling em logs, respostas ou documentação. Os SQLs foram versionados sem inserir segredo literal.
