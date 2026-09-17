# Simplificar Estúdio Criativo — keyframes + Gemini

Objetivo: remover mosaico/vídeo local e deixar o Estúdio como diretor criativo, gerador de imagens-chave e pacotes Gemini.

Regras aprovadas:
- Modos: `full`, `product_only`, `institutional`.
- Imagens no modo completo: 10s=2, 20s=3, 30s=4, 40s=5, 50s=6, 60s=7.
- Fórmula: `duration_seconds / 10 + 1`.
- Geração sequencial, uma imagem por vez, com continuidade pela imagem anterior aprovada.
- Interface deve exibir apenas uma imagem efetiva por posição (`approved_image_url || candidate_image_url`) e evitar duplicações.
- Remover `mosaic_6x6`, `creative-studio-mosaic.js`, montagem de vídeo WebM e controles de vídeo local.
- Melhorar botões e mensagens de estado.
- Prompt de imagem com STYLE LOCK, PRODUCT LOCK, CONTINUITY, IMAGE ROLE e NEGATIVE CONSTRAINTS.
- Projetos salvos, reabertura/reutilização e exclusão permanecem.

Verificação: contratos do Estúdio, sintaxe JS, compilação das Edge Functions e todos os workflows existentes devem ficar verdes antes de merge/deploy.
