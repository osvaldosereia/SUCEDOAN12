# Estúdio Criativo — Aprovação Progressiva

## Objetivo
Transformar o Estúdio em um diretor criativo mobile-first para storyboards verticais, com custo controlado e aprovação humana antes de cada gasto visual.

## Fluxo
1. Briefing: produtos, duração 10/20/30/40/50/60s, áudio (IA decide, locução, trilha/SFX), direção manual ou IA, tema e observações.
2. História: gerar somente texto; permitir comentário de revisão, nova ideia e aprovação explícita.
3. Storyboard textual: 1 frame a cada 5s, portanto duration/5 + 1 frames. Mostrar descrição visual completa antes de imagens; permitir revisão global.
4. Produção: gerar somente o próximo frame pendente. Frame 1 estabelece Visual Bible. Cada frame pode ser aprovado, regenerado ou revisado por comentário. Alterações que afetem continuidade replanejam automaticamente descrições futuras ainda não aprovadas.
5. Gemini: após frames aprovados, criar pacotes sobrepostos de 10s com referências início/meio/fim e prompts adaptados ao modo de áudio.

## Estados
Projeto: briefing, story_review, storyboard_review, frame_review, complete. História e storyboard têm approved_at. Frames: planned, generating, review, approved, stale, error. Somente approved pode ser previous_image da geração seguinte.

## Custos
Texto/revisões antes das imagens. Mostrar contagem planejada, gerada e regenerada. Não gerar lote. A estimativa de custo deve ser informativa e nunca bloquear a criação.

## UX
Tela única. Mobile: uma coluna, ação atual fixa/prioritária e cards verticais. Desktop: conteúdo principal + painel de progresso. Sempre destacar a próxima ação. Manter busca explícita de produtos.

## Segurança
OpenAI somente em Edge Functions com JWT; nenhuma chave no navegador. Preservar projetos existentes e o pipeline legado apenas como rollback técnico.
