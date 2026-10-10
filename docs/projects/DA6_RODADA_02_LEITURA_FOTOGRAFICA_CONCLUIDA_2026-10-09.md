# Dona Antônia DA6 — RODADA 2 CONCLUÍDA: Robustez da leitura fotográfica (09/10/2026)

## Estado
- Branch: `agent/gondola-labels-balance-20261009` | PR #987 (draft), sem merge/deploy.
- **CI aprovado:** [GitHub Actions DA6 run 37936999497](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37936999497) — três jobs com `success`.
- **41/41 testes Node aprovados**, 0 falhas; Deno `edge-types` aprovado (inclusive PNG/JPEG/WebP WASM); PostgreSQL17 `postgres-review` aprovado em fixture isolada com rollback.
- Nenhum produto, estoque ou Bling foi modificado. Nenhum SQL de revisão foi aplicado ao Supabase de produção.
- **Sem fotos físicas:** testes utilizam imagens de QR real geradas digitalmente, homografia projetiva, rotação, sombra, borramento e reflexos em pixels controlados. Impressora/celular físicos devem ser homologados antes de uso operacional.

## Alterações e testes
1. `tests/da6-photo-rotation-perspective.test.cjs`: simula captura de uma etiqueta DA6 com QR real e seis contagens [0,1,7,10,23,99], rastro dos quatro marcadores, sem mocks de decodificador. Confirma original e rotações 90°, 180° e 270° em leitura de ponta a ponta; transforma a imagem por homografia projetiva simulando perspectiva; aplica sombra gradual e desfoco moderado; apaga o QR e exige recusa de identidade; simula reflexo sobre bolinha e exige erro/revisão, jamais contagem inventada.
2. A perspectiva expôs defeito verdadeiro: no raster 500×750 o QR inclinando pode desaparecer, embora seja recuperável na imagem retificada 1000×1500. O módulo `vitrine/admin/inventory-label-photo-reader.js` agora faz fallback óptico full-resolution quando não localiza QR na prévia. Após cada leitura verifica formato DA6, UUID, serial e quadrante do QR no cabeçalho direito, sem substituir identidade por suposição. Se não validar, retorna `label_qr_not_found`, sem gravar quantidade.
3. `supabase/functions/admin-products-live-v1/inventory-label-worker-omr.ts` recebeu o mesmo tratamento no motor de produção para evitar divergência entre frontend e worker.
4. Manutenção do algoritmo OMR sem IA. Contagens ambíguas não são aceitas; os casos não confiáveis seguem para revisão/reenvio. Nenhum balanço histórico é aplicado ao estoque atual.

## Critérios de saída
- [x] Rotações cardinal 0°/90°/180°/270° com QR real e seis valores corretos.
- [x] Perspectiva projetiva moderada e identificação da etiqueta com QR recuperado em resolução total.
- [x] Sombra gradual e leve desfoco sem contagem errada.
- [x] QR apagado recusa identidade/contagem.
- [x] Reflexo que encobre uma marca causa revisão, sem contagem inventada.
- [x] CI do DA6 3/3 `success`, 41 testes Node sem falhas.
- [ ] Homologação com impressora física e fotos reais não é escopo concluído nesta rodada (gate para R6, antes de publicar).

## Próxima rodada — R3
- Homologar upload assinado de 10, 50 e 100 imagens; idempotência por hash, arquivos duplicados, tamanho, URL expirada e retomada parcial após perda de conexão.
- Persistir lote e comprovar que o celular pode fechar depois de confirmar os uploads (processamento exclusivamente server-side).
- Testar autenticação, políticas de Storage e contadores, sem usar estoque real.
- Criar testes de integração em ambiente isolado e manter CI verde.
- Não fazer merge, aplicar migrações DA6 de revisão ou publicar Edge sem gates completos de R3–R8.
