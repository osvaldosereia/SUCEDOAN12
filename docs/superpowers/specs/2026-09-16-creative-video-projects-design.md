# Estúdio Criativo — Projetos Editáveis e Arsenal Inteligente

## Objetivo
Transformar o gerador atual em um estúdio de vídeos verticais editáveis: cada criação persiste roteiro, cenas, arsenal, composição, versões, feedback e renders, permitindo correções incrementais sem reiniciar do zero.

## Princípios
- O produto real é protegido e nunca substituído pelo Asset Hunter.
- O MP4 é uma saída versionada; o projeto editável é a fonte de verdade.
- Antes de renderizar, o sistema monta um arsenal amplo e permite curadoria no Admin.
- Ordem de aquisição: biblioteca própria -> fontes web gratuitas/licenciadas -> elementos procedurais -> geração IA complementar.
- Pack IA 3x3 é complementar, não obrigatório nem fonte exclusiva.
- Todo asset persistido deve carregar descrição semântica, tags, origem, licença, tipo e histórico de uso.
- Feedback humano gera nova versão preservando tudo que não precisa mudar.
- Meta operacional: aproximadamente R$ 1 por edição inicial e aproximadamente R$ 1 por rodada de ajuste, sem sacrificar qualidade por economia extrema.
- Render final vertical: 1080x1920, 30 fps, 15–25 s, sem narração obrigatória.

## Modelo
`creative_video_projects`: identidade, produto, briefing, plano criativo, estado, versão atual e orçamento.

`creative_video_project_scenes`: cenas ordenadas com intenção, timing e composição persistível.

`creative_video_project_assets`: vínculo entre projeto e arsenal; origem, score, estado de curadoria e uso por cena.

`creative_video_versions`: snapshots imutáveis de roteiro/composição/assets e referência ao render.

`creative_video_feedback`: instrução humana, interpretação estruturada, escopo afetado e versão de origem/destino.

A biblioteca global de assets continua separada do vínculo por projeto, permitindo reaproveitamento futuro.

## Fluxo
1. Produto -> Diretor cria conceito e cenas.
2. Projeto é persistido antes de qualquer render.
3. Asset Hunter busca mais candidatos que o mínimo exigido pelo roteiro.
4. Admin exibe “Arsenal desta produção”, com Buscar mais, selecionar, descartar e gerar pack IA.
5. Composição usa assets aprovados + elementos procedurais + packshot real.
6. Render gera uma `creative_video_version`.
7. Feedback cria uma revisão delta; cenas/assets não afetados são preservados.
8. Nova versão é renderizada e comparável à anterior.

## Qualidade
O pipeline deve impedir render final quando faltar packshot, composição ou assets essenciais. O validador avalia história, composição, movimento, sound design, presença correta do produto e fechamento comercial. Uma cena não deve ser aceita como final quando for apenas imagem parada com zoom sem justificativa criativa.

## Admin
O fluxo deve ficar legível no celular: Produto -> Direção -> Arsenal -> Composição/Render -> Versões/Ajustes. O usuário consegue inspecionar miniaturas antes do render, pedir mais candidatos e corrigir uma versão existente sem recriar o projeto.

## Evolução do render
Remotion será avaliado/adotado como compositor programático para cenas e motion design, mantendo FFmpeg para encoding/finalização. A migração deve preservar o worker atual até o novo compositor provar qualidade no piloto.
