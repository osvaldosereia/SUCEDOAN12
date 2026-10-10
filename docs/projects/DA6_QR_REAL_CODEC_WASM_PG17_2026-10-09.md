# DA6 — Rodada de homologação técnica: QR real, PG17 e codecs WASM
Data: 09/10/2026. Projeto: Dona Antônia `SUCEDOAN12`. Branch `agent/gondola-labels-balance-20261009`.

## Evidências que passaram
- [DA6 CI run #37928719527](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37928719527): **3 jobs SUCCESS**.
- `deterministic-tests`: testes Node de OMR, upload 100 fotos por lote, revisão/recuperação, QR digital **real** com `qrcode-generator` e `jsqr`. Testa QR ausente sem atribuir identidade.
- `edge-types`: `deno check` do worker e API e `deno test` com imagens **binárias reais**, decodificadas no mesmo `@imagemagick/magick-wasm@0.0.44` do worker. PNG, JPEG e WebP geram RGBA válido; 2 testes de codec aprovados em ~332 ms na máquina do CI. Corrigido carregamento do WASM: versão 0.0.44 passou a exportar `./magick.wasm` em `dist/x86/`; resolução agora usa `import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.44/magick.wasm')`.
- `postgres-review`: banco efêmero **PostgreSQL 17**, migração `20261009140500_da6_manual_review_audit_v1.sql`, aceitação/retificação dos balanços, idempotência, negação de viewer/outro operador/slot inativo e RPC cliente não autorizada, com rollback final. Nenhum dado de produção foi modificado.
- A verificação `Admin and Baskets Guard CI` permanece em falha por expectativa `channel_origin` da vitrine pública de pedidos; não foi alterada nesta branch, separar da homologação DA6.

## Commits e arquivos desta rodada
- `.github/workflows/da6-inventory-labels-ci.yml`: jobs `deterministic-tests`, `edge-types` e `postgres-review`.
- `tests/da6-review-postgres-fixture.sql`, `tests/da6-review-postgres-assertions.sql`: fixtures controladas para PostgreSQL 17.
- `tests/da6-real-qr-omr-integration.test.cjs`: QR de verdade e seis marcações numa etiqueta sintética.
- `tests/da6-edge-codec.test.ts`: decodificação PNG/JPEG/WebP via WASM de produção.
- `supabase/functions/admin-products-live-v1/inventory-label-worker.ts`: integração jsQR/crypto tipada, exportação do decodificador para teste, localização correta do WASM em v0.0.44.
- `supabase/functions/admin-products-live-v1/inventory-label-worker-omr.ts`: glue JS da geometria existente marcado `@ts-nocheck`; os algoritmos originais continuam testados por Node com entradas reais/sintéticas.

## Status operacional
- **Não publicado**: branch e PR #987 ainda não mesclados; Edge Function de produção `admin-products-live-v1` ainda v158, sem worker DA6.
- Estrutura no banco canônico existente: bucket privado `inventory-label-photos`, tabelas de lotes/fotos/contagens, claim, retry e cron. A migração de revisão desta branch **não foi aplicada no banco canônico**.
- 0 fotos reais verificadas e nenhuma prova de que uma impressora física 203dpi gere etiquetas escaneáveis.
- O fluxo de contagens é histórico e fica em `pending_review` ou `approved` sem `inventory_balance_commit` ou escrita no Bling.
- Falta: fotografias reais em perspectivas variadas/sombras; QR em etiqueta impressa; bateria de desempenho/timeout para 100 fotos; reentrada de fila depois de fechar celular; verificação de recursos Supabase Edge em seu ambiente de produção; possível página de reprocessamento dos erros; revisão final UX no dispositivo e liberação gradual só após homologação.

## Próxima execução
1. Verificar main, HEAD branch, PR #987 e CI verde da última alteração.
2. Se houver banco separado, executar smoke completo do worker com um lote de teste, incluindo upload assinado real e cron, sem cliente/estoque.
3. Validar rotação 90°/180°, sombra, desfoque, marcas ambíguas, etiqueta 203dpi, limites de tamanho de imagens e memória.
4. Verificar A4 e carregamento do Admin sem regressão; só então considerar migração de revisão/deploy controlado.
5. Não encerrar automação horária até fluxo completo estar pronto e publicado com segurança.
