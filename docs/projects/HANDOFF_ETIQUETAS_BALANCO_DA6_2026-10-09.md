# Handoff — Etiquetas térmicas DA6 e balanço fotográfico

**Data:** 2026-10-09  
**Branch:** `agent/gondola-labels-balance-20261009`  
**Produção:** NÃO publicado / main não alterada.  
**Solicitante:** Dona Antônia / Vitrine Admin.

## Objetivo aprovado

1. Impressão rápida 100 × 150 mm vertical, individual, seleção de produtos, filtros ou por gôndola.
2. Etiqueta OMR de seis balanços: cada linha tem um quadrado ATIVAR e duas séries de 0–9 (dezena, unidade). Não escrever nada; marcar círculos. **Não existe data de contagem pré-marcada**. Data da importação pode ficar em metadados; não atribuir data histórica inventada.
3. Código do produto: manter GTIN se o dígito verificador for válido; sem GTIN válido, Code128 interno derivado do UUID. QR `DA6|<uuid-base36>|<nonce>` identifica versão/produto/etiqueta impressa para foto.
4. No Balanço, criar aba dedicada para upload de dezenas de fotos em uma única ação. Enviar a Storage privado, confirmar persistência e liberar o celular. Servidor processa fila uma a uma, usa leitura tradicional (barcode/QR + marcas) **sem IA**, 1 tentativa + até 2 retentativas, com backoff e erro por foto.
5. Fotos boas processadas automaticamente; fotos duvidosas exibem motivo e permitem correção manual. Logs e proteção contra duplicações devem sobreviver a refresh/reupload. **Não alterar saldo no Bling com registros históricos sem revisão/ordenação segura.**

## Alterações realizadas na branch nesta rodada

- `vitrine/admin/product-shelf-labels.css`: melhorias da lista, controles seleção/etiqueta.
- `vitrine/admin/product-label-print.css`: layout @page 100×150 mm, quatro marcadores geométricos nos cantos, seis linhas de marcações.
- `vitrine/admin/product-shelf-labels.js`: cria QR exclusivo por etiqueta e Code128 por produto, imprime lote com um único comando de impressão; limite 300 para evitar travar o navegador.
- `vitrine/admin/product-shelf-admin-ui.js`: carrega sob demanda, injeta botão imprimir e checkbox nos cards, impressão de selecionados, filtrados, por gôndola, produtos ativos; seletor de gôndola desktop via `product_quick_save`.
- `vitrine/admin/index.html`: inclui os arquivos JS/CSS novos na página.
- Mantém fora da main até QA/homologação.

### Limitações já identificadas

- O gateway `admin-products-live-v1` aceita alteração rápida de gôndola 1..30; gôndolas maiores ainda precisam de ajuste coordenado no backend. A leitura de gôndolas existe (`gondolas`, `gondola`).
- A impressão depende temporariamente dos geradores JsBarcode e qrcode-generator por CDN. Para funcionamento offline ideal, hospedar cópias JS revisadas no repositório.
- Não há ainda tela/fila de foto nem processamento OMR. Não comunicar que a função está pronta ou publicada.
- QR `DA6|...` identifica uma etiqueta; manter unicidade persistente da combinação serial + slot na base.
- Antes de mesclar, validar em navegador desktop e celular, verificar dimensões na impressora térmica, QR/barcode com scanner e fotos de teste. Testar 0, 1, 7, 10, 23, 99, sombras, perspectiva, duplicações e foto girada.
- Não substituir o fluxo existente de Balanço A4, separação ou estoque Bling.

## Arquitetura recomendada para a fila, próxima rodada

- Criar bucket privado `inventory-label-photos` e tabelas canônicas `inventory_label_photo_batches`, `inventory_label_photos`, `inventory_label_counts`.
- GET/POST através do gateway Admin já existente, com autenticação step-up, escopo operacional, limites por foto e upload sem expor service role ao navegador.
- Worker com lock transacional (FOR UPDATE SKIP LOCKED), `attempt_count` entre 0 e 3; claims e heartbeats para reexecução após timeout; deduplicação por SHA-256 do arquivo + combinação `label_serial,slot`.
- Processamento servidor é obrigatório para liberar o celular. Usar `pg_cron + pg_net` já instalados no Supabase para invocar worker a cada minuto enquanto houver pendências. Credenciais somente via Supabase Vault, nunca em SQL de código ou front-end. Documentação oficial https://supabase.com/docs/guides/functions/schedule-functions .
- OMR determinístico: decodificar JPEG/PNG no servidor (biblioteca Deno/WASM validada); detectar quatro quadrados, homografia / correção de rotação, localizar QR, marcar áreas fixas por coordenadas relativas ao layout, comparar densidade de tinta com amostras vazias e confiança; rejeitar dupla marcação, marca insuficiente e inconsistência.
- Para cada slot ativado e com exatamente uma dezena e unidade, guardar `quantity = tens * 10 + units` (0..99); serial e slots inativos são ignorados. Se uma foto for enviada outra vez, não criar registros duplicados nem sobrescrever informação histórica automaticamente.
- Toda contagem lida entra como `pendente de conferência/aplicação`. A liberação de dezenas de fotos é automática, **não** a atualização indiscriminada do saldo canônico com dados históricos. Para sincronizar Bling somente usar commit seguro existente após confirmação.
- Painel deve mostrar quantas fotos enviadas, na fila, em processamento, lidas, para revisar e erros permanentes. Reprocessar erro manualmente pode reiniciar contador com ação explícita.

## Sequência para próximas rodadas

1. Inspecionar branch vs main para conflitos, validar JS/sintaxe do HTML e testar carregamento dos scripts.
2. Finalizar seletor de gôndola para números registrados até 9999, com backend seguro; aprimorar performance impressão e UX de seleção.
3. Criar migração do bucket/tabelas/RPC de claim, aplicar com validações e sem credenciais públicas.
4. Implantar worker OMR determinístico e pipeline de imagem comprovadamente compatível com Supabase Edge Runtime.
5. Criar aba no Balanço para upload múltiplo, acompanhamento por polling ao abrir a tela, erros/retentativas/revisão.
6. Testes integrados, impressora 203dpi, câmera, duplicação, horário, sem IA, fechar navegador após upload.
7. Somente depois de homologado e estável, PR/revisão e publicação segura. Atualizar handoff e desativar automação horária ao concluir.
