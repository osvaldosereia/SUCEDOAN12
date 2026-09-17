# Estúdio Criativo — Storyboard + Gemini Design

## Objetivo
Transformar o Estúdio Criativo do Admin de gerador/renderizador de MP4 em diretor criativo de conteúdo social: selecionar um ou mais produtos ativos, criar uma história forte para Reels, gerar keyframes verticais encadeados com GPT Image 2.5 Sunburst em qualidade low e entregar pacotes de imagens + prompts prontos para uso manual no app pago do Gemini.

## Princípios criativos
- História primeiro; propaganda depois.
- Conteúdo deve buscar retenção, curiosidade, emoção, humor, surpresa, identificação ou encantamento.
- Produto pode ser protagonista ou integração natural no mundo da história: TV, outdoor, prateleira, mesa, sacola, placa, cenário, solução ou payoff.
- Evitar estética fotorrealista como padrão. Priorizar massinha, papel recortado, origami, feltro, colagem, papelão, tecido e miniaturas artesanais.
- Cada conceito deve ter hook imediato, progressão causal, virada/payoff e fechamento memorável.
- CTA deve nascer da história e pode ser discreto; não obrigar preço, oferta ou personagem segurando produto.
- O Diretor deve rejeitar internamente conceitos que pareçam apenas propaganda bonita sem história.

## Seleção de produtos
O Admin passa de seleção única para seleção múltipla. Cada produto selecionado preserva snapshot de id, nome, marca, categoria/subcategoria, preço/oferta quando aplicável e URL de imagem. O Diretor decide o papel narrativo de cada produto sem forçar que todos tenham o mesmo destaque.

## Duração e keyframes
Padrão: 30 segundos. Um keyframe a cada 5 segundos, incluindo início e fim: 0, 5, 10, 15, 20, 25 e 30 segundos (7 imagens únicas). A estrutura deve aceitar outras durações múltiplas de 10 segundos mantendo a regra de keyframe a cada 5 segundos.

## Geração visual
- Provider obrigatório desta fase: OpenAI GPT Image 2.5 Sunburst.
- Qualidade: low.
- Formato: vertical 9:16 para Reels.
- O primeiro keyframe estabelece personagem, cenário, material artesanal, paleta, iluminação e composição.
- Cada keyframe posterior recebe obrigatoriamente o keyframe imediatamente anterior como referência visual.
- Cada geração recebe também um continuity lock textual contendo identidade de personagens, roupa, materiais, proporções, cenário, produto, paleta e elementos imutáveis.
- Regenerar um keyframe não deve obrigar regenerar os anteriores; se o usuário aceitar a nova versão, os posteriores podem ser marcados como potencialmente desatualizados para continuidade.

## Diretor criativo
Antes de gerar imagens, produzir pelo menos três conceitos textuais baratos e selecionar internamente um conceito final segundo critérios de retenção social, clareza visual, força emocional, originalidade, integração natural do produto e viabilidade em keyframes. O resultado persistido deve conter: título, premissa, hook, sentimento dominante, linguagem artesanal, arco de 30s, papel de cada produto, payoff, CTA orgânico, continuity bible e descrição de cada keyframe.

## Pacotes Gemini
Para 30s, produzir três pacotes:
- Pacote 1: keyframes 0s, 5s, 10s + Prompt Gemini 1.
- Pacote 2: keyframes 10s, 15s, 20s + Prompt Gemini 2.
- Pacote 3: keyframes 20s, 25s, 30s + Prompt Gemini 3.

O Admin não chama API de vídeo. O usuário baixa as três imagens e copia o prompt para usar manualmente no app Gemini pago.

## Estrutura dos prompts Gemini
Cada prompt deve ser escrito como direção de animação, não como descrição genérica. Deve conter:
1. Papel explícito das três imagens: início, estado intermediário e estado final.
2. Style lock: material artesanal, textura, iluminação, atmosfera e linguagem stop motion.
3. Reference/continuity lock: o que não pode mudar.
4. Ação detalhada do primeiro intervalo e do segundo intervalo.
5. Direção de personagem: gesto, expressão, intenção e causalidade.
6. Direção de câmera: enquadramento, movimento e foco apenas quando narrativamente úteis.
7. Física do material: comportamento coerente com massinha/papel/feltro/origami etc.
8. Ritmo para Reels: ação legível, progressão e retenção.
9. Áudio: ambiente, SFX, música e pausas quando fizer sentido.
10. Restrições negativas: sem morphing indevido, troca de personagem, deformação de produto/logotipo, membros extras, objetos sem causa ou mudança gratuita de cenário.
11. Prioridade final: história, emoção, continuidade e identidade visual antes da publicidade.

## Admin UX
Fluxo principal: Produtos → História → Storyboard → Pacotes Gemini.
- Busca explícita com estado buscando/não encontrado/erro.
- Produtos selecionados aparecem como chips/cards removíveis; busca permanece disponível para adicionar outros.
- Botões: Criar história, Outra ideia, Gerar storyboard, Regenerar keyframe, Copiar prompt, Baixar imagem e Baixar 3 imagens do pacote quando tecnicamente possível no browser.
- Timeline visual com 7 cards e timestamp.
- Cada card mostra status: planejado, gerando, pronto, erro.
- Seção final mostra os três pacotes Gemini, sem player de vídeo e sem botão Renderizar vídeo.
- Projetos recentes passam a mostrar storyboards/projetos e seu estado, não jobs de MP4.

## Persistência
Reaproveitar `creative_video_projects`, `creative_video_project_scenes`, `creative_video_project_assets`, `creative_video_versions` e `creative_video_feedback` já criadas. Adicionar apenas o necessário para seleção múltipla, keyframes e pacotes Gemini. Não remover tabelas antigas nesta fase; compatibilidade e rollback têm prioridade.

## Custos e segurança
- Não gerar imagem antes de o conceito textual final existir.
- GPT Image 2.5 Sunburst sempre em low nesta fase.
- Registrar provider/model/quality e uso/custo por keyframe quando retornados pelo provider.
- Regeneração é unitária por padrão para evitar sete novas cobranças.
- Nunca enviar chave OpenAI ao browser; geração ocorre em Edge Function.

## Fora de escopo
- Render MP4 automático.
- API Veo/Gemini para gerar vídeo.
- Interpolação ou animação procedural.
- Publicação automática em redes sociais.
- Substituição/desativação destrutiva do worker antigo nesta primeira migração.

## Critérios de aceite
1. Usuário seleciona múltiplos produtos ativos.
2. Diretor cria história social completa antes de gastar com imagens.
3. Projeto de 30s gera exatamente 7 keyframes 9:16 em intervalos de 5s.
4. Cada keyframe depois do primeiro usa o anterior como referência.
5. Provider visual está fixado em GPT Image 2.5 Sunburst low.
6. Admin entrega três pacotes 0/5/10, 10/15/20 e 20/25/30.
7. Cada pacote possui prompt Gemini detalhado e copiável.
8. Usuário consegue regenerar apenas um keyframe.
9. Interface não oferece mais renderização MP4 como ação principal.
10. Testes existentes relevantes continuam passando e novos contratos cobrem o fluxo de storyboard.