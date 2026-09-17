# Simplificação do Estúdio Criativo — imagens-chave

**Objetivo:** remover mosaico e vídeo local, manter somente direção criativa, imagens-chave e pacotes Gemini.

## Regras aprovadas
- Modos: `full`, `product_only`, `institutional`.
- Remover `mosaic_6x6` e `creative-studio-mosaic.js`.
- Quantidade de imagens-chave: 10s=2, 20s=3, 30s=4, 40s=5, 50s=6, 60s=7.
- Produção visual continua sequencial: uma imagem por vez, com aprovação antes da próxima.
- Timeline exibe apenas `approved_image_url || candidate_image_url`, nunca duplicadas.
- Cada imagem tem baixar, copiar prompt e regenerar.
- Pacotes Gemini continuam em blocos de 10s.
- Mensagens da UI devem ser curtas, claras e orientadas à próxima ação.
- Projetos salvos continuam funcionando.

## Implementação
1. Atualizar contratos/testes e confirmar RED.
2. Simplificar HTML/JS e remover assets do mosaico.
3. Alterar diretor para key images na nova contagem.
4. Reforçar prompt de imagem com IDENTIDADE VISUAL, PRODUCT LOCK, CONTINUIDADE, OBJETIVO e RESTRIÇÕES.
5. Corrigir renderização duplicada e botões.
6. Rodar CI completa, integrar e publicar Edge Functions com JWT.
