# Creative Studio V1 — Design

## Objetivo

Construir no `admin/` da Dona Antônia um Estúdio Criativo capaz de selecionar um produto real, descobrir seu melhor território criativo, criar uma micro-história audiovisual de 15–25 segundos e produzir um plano executável de vídeo vertical 9:16 com baixo custo de IA. A V1 prioriza direção criativa + resolução de assets; renderização completa entra em marcos subsequentes do mesmo produto.

## Princípios obrigatórios

- O sistema é um estúdio audiovisual, não um gerador de stop-motion/massinha.
- Stop-motion é apenas uma técnica/modificador possível.
- Nunca usar narração/voice-over. A narrativa usa imagem, movimento, música, efeitos e silêncio intencional.
- Duração mínima: 15 s. Faixa normal: 15–25 s. O Diretor escolhe a menor duração que conte bem a história.
- Produto, nome, preço, oferta e logo comerciais vêm de dados reais; nunca são inventados pela IA nem desenhados dentro de uma imagem gerada.
- Todo vídeo deve ter conceito, sentimento, protagonista/foco, situação, acontecimento/conflito, transformação e payoff.
- Se preço e logo forem removidos, a criação ainda deve ser interessante de assistir.
- A IA decide semanticamente; o software decide coordenadas, timing, interpolação, física, composição e render.
- A V1 deve ser econômica por padrão. Geração de imagem e vídeo por IA é exceção.

## Integração com o projeto

A interface entra em `admin/`, não em `admin-v3/`. O `admin/` mantém o padrão atual de páginas HTML/JS/CSS independentes. O Creative Studio terá arquivos próprios para não aumentar responsabilidades de `admin/app-lite.js`.

A interface é apenas o painel de controle. Diretor, Asset Resolver, Asset Hunter e posteriormente renderização ficam em serviços/módulos isolados, permitindo reutilização futura.

## Fluxo principal

1. Usuário seleciona um produto real.
2. Sistema carrega dados comerciais e visuais do produto.
3. Senior Creative Director executa Creative Mining.
4. Diretor avalia múltiplos territórios internamente e retorna uma única ideia principal.
5. Validador determinístico verifica requisitos criativos e técnicos.
6. Asset Resolver procura elementos na biblioteca local.
7. Para lacunas, Asset Hunter procura somente fontes permitidas e tenta aquisição Just-in-Time.
8. O Admin apresenta conceito, território, sentimento, história, duração, assets encontrados/faltantes e custo previsto.
9. Usuário pode Produzir, pedir Outra ideia ou Ajustar.
10. Marcos posteriores convertem o plano semântico em composição, movimento, áudio e MP4.

## Senior Creative Director

O Diretor combina seis competências: Creative Mining, Storytelling, Animation Direction, Art Direction, Short-form Retention e Commercial Integration. Essas competências são módulos conceituais do prompt/contrato, mas podem ser executadas em uma única chamada curta para reduzir custo.

### Creative Mining

Antes de escrever história, o Diretor considera territórios derivados de: função, aroma, sabor, ingrediente, cor, variante/nome, sensação, ocasião, benefício emocional, embalagem, textura, temperatura, origem, ritual, transformação, contraste, associações culturais/visuais, humor e surrealismo.

A função óbvia do produto nunca recebe prioridade automática. O Diretor escolhe o território com maior potencial audiovisual que continue verdadeiro em relação aos dados do produto.

Exemplo: `Desinfetante Flores do Campo` pode selecionar aroma/natureza/frescor e criar `um campo inteiro dentro do frasco`, em vez de mostrar alguém limpando o chão.

O contrato retorna apenas alternativas resumidas e a seleção final; não solicita nem armazena raciocínio interno detalhado.

### História e retenção

A saída precisa declarar: território escolhido, conceito, emoções, hook, protagonista/papel do produto, setup, acontecimento/conflito, escalada, transformação, payoff, momento visual memorável, duração e cenas/beats.

A IA deve favorecer histórias executáveis com assets existentes. Quando algo realmente necessário não existir, declara `asset_request` em vez de inventar IDs ou comandos.

## Contrato semântico

A IA nunca fornece coordenadas ou nomes de arquivos. Ela usa vocabulário fechado de papéis, emoções, behaviors, movimentos, efeitos, câmera e intenções sonoras.

Exemplos de movimento: `enter_left`, `enter_right`, `rise`, `drop`, `hop`, `bounce`, `shake`, `wobble`, `spin`, `tilt`, `slide`, `peek`, `fall`, `push`, `pull`, `chase`, `follow`, `orbit`, `scatter`, `stack`, `celebrate`, `squash`, `stretch`, `zoom`, `reveal`, `exit`.

Behaviors iniciais: `curious`, `shy`, `excited`, `sleepy`, `nervous`, `heroic`, `sneaky`, `surprised`, `happy`, `chaotic`.

O validador rejeita ou normaliza valores fora do vocabulário e verifica: Creative Mining presente; território selecionado; hook; mudança; payoff; produto; duração >=15 e <=25; ausência de voice-over; assets solicitados de forma semântica; fechamento comercial; e ausência de clichê funcional automático sem justificativa criativa.

## Biblioteca Semântica

Cada asset é uma entidade pesquisável, não apenas um arquivo. Metadados mínimos: provider, source URL/ID, licença, commercial_use_allowed, attribution_required, tipo/formato, objeto/categoria, conceitos, sentimentos/territórios, ações compatíveis, papel visual, estilos, orientação, transparência/background, qualidade, usage_count e last_used_at.

A biblioteca é style-agnostic e aceita fotografia, PNG, SVG, ilustração, 3D, stickers, texturas, áudio e elementos gerados proceduralmente.

## Asset Resolver

Ordem de resolução:

1. filtros determinísticos (licença, tipo, orientação, transparência, compatibilidade);
2. tags e sinônimos;
3. PostgreSQL Full Text Search;
4. busca semântica/híbrida local somente quando necessário;
5. substituto aproximado/procedural;
6. Asset Hunter;
7. geração de imagem por IA somente com política/custo permitido.

A IA pede significado (`need`, `keywords`, `role`, `actions`); o Resolver escolhe IDs reais.

## Asset Hunter — aquisição Just-in-Time

A biblioteca cresce conforme as criações precisam de novos elementos. O sistema não baixa milhares de arquivos antecipadamente.

Quando falta um asset, o Hunter:

1. expande o pedido usando dicionário local de sinônimos/conceitos;
2. consulta apenas provedores cadastrados e permitidos;
3. coleta candidatos e metadados sem baixar tudo;
4. valida licença e uso comercial;
5. pontua relevância, qualidade, formato, orientação, ação compatível e novidade;
6. baixa somente o melhor candidato ou um pacote pequeno claramente vantajoso;
7. registra proveniência/licença;
8. cataloga semanticamente;
9. disponibiliza ao Resolver;
10. reutiliza em criações futuras.

Política de fontes: `AUTO` para fonte/licença segura para automação; `VALIDATE` quando a licença varia por item; `BLOCK` quando não é segura para aquisição automática. Cada asset mantém prova de proveniência e licença.

Orçamento normal: até 3 novas aquisições externas por vídeo. Se a história exigir muitas lacunas, o Diretor deve preferir adaptar a criação aos elementos disponíveis.

Fontes inicialmente candidatas já catalogadas incluem Kenney, Quaternius, Poly Haven e seleção OpenGameArt. SVG Repo/unDraw podem ser candidatos condicionais conforme licença/termos de cada uso. Nunca presumir que todos os itens de um provedor possuem a mesma licença quando isso não for verdade.

## Elementos procedurais

Antes de procurar ou gerar itens simples, o software pode criar gratuitamente: círculos, linhas, estrelas, confete, gradientes, ondas, grids, raios, sombras, etiquetas, caixas, padrões, partículas e formas abstratas.

Hierarquia econômica definitiva: `procedural -> biblioteca -> Asset Hunter -> adaptação criativa -> IA de imagem -> IA de vídeo excepcional`.

## Motion/Behavior Engine

O Diretor declara intenção; o motor executa. Movimento e atuação são separados. Exemplo: `motion=enter_left`, `behavior=curious`.

Behaviors são compostos por primitives com antecipação, pausa, overshoot, squash/stretch, follow-through e settle. Stop-motion pode aplicar stepped movement, held frames e pequenas irregularidades, mantendo saída final em 30 fps.

Mudanças físicas impossíveis por transformação 2D/3D simples usam esta ordem: simulação programática, asset de estado existente, geração de estado por IA.

## Áudio

Nunca há voz. O Diretor especifica intenção musical/SFX, não arquivos. O Audio Resolver escolhe arquivos licenciados/reutilizáveis. O Beat Engine sincroniza entradas, impactos, cortes e reveals com música e SFX. Silêncio intencional é permitido.

## Creative Memory

Registrar conceito, território, hook, estrutura narrativa, assets, movimentos, duração, produto/categoria e data. Antes de criar, verificar similaridade/repetição recente e fornecer restrições de novidade ao Diretor. Métricas de desempenho (retenção, visualizações, cliques, pedidos etc.) são evolução posterior e não bloqueiam V1.

## Admin UX

Nova entrada `Estúdio Criativo` em `admin/` com página própria. Áreas: Criar, Vídeos, Elementos e Configurações.

Fluxo Criar: selecionar produto -> Criar ideia -> visualizar conceito/território/sentimento/história/duração/assets/custo -> Produzir, Outra ideia ou Ajustar.

O sistema apresenta somente uma ideia principal. `Outra ideia` gera uma nova opção sob demanda, evitando custo e complexidade de mostrar três conceitos sempre.

O Admin não terá timeline profissional na V1. Ajustes sem IA devem cobrir preço/texto, música, elementos, intensidade de animação e configurações básicas; `Pedir outra versão à IA` altera o JSON semântico.

## Custos e segurança de gasto

Registrar custo estimado e realizado por job. Assets, busca local, movimentos e composição não contam como chamadas de IA. Meta operacional: vídeo normal baseado em biblioteca deve permanecer na ordem de centavos; não existe promessa de valor fixo porque preços de API e infraestrutura variam.

O Admin terá limite configurável de gasto por vídeo. Ações pagas acima do limite exigem aprovação explícita. Geração de imagem não ocorre automaticamente quando houver alternativa gratuita adequada.

## Dados e evolução do catálogo existente

O catálogo `stopmotion_*` existente deve ser tratado como fundação histórica, mas generalizado progressivamente para linguagem style-agnostic. Não fazer migração destrutiva na V1. Campos legados específicos de massinha/stop-motion não comandam o novo Diretor.

Adicionar metadados genéricos e busca semântica/FTS por migração compatível. Não alterar tabelas não relacionadas nem habilitar RLS indiscriminadamente sem políticas verificadas.

## Entregas incrementais

1. Fundação/contratos + testes.
2. Senior Creative Director + Creative Mining + validador.
3. Biblioteca semântica + Resolver.
4. Asset Hunter JIT + política de licença.
5. Admin V1 para produto -> ideia -> assets/custo.
6. Motion/Behavior + compositor.
7. Audio/Beat Engine.
8. Render 9:16 MP4.
9. Primeiro Reel real ponta a ponta e refinamento.

Cada marco deve produzir software testável. A primeira prova de valor é: selecionar um produto real e obter um plano criativo estruturado de 15+ s, com território, história, cenas, assets resolvidos/faltantes, atuação, movimento, áudio e custo previsto.

## Critérios de aceitação da primeira prova de valor

- Seleciona produto real ativo sem duplicar cadastro.
- Diretor retorna JSON válido e compacto.
- Creative Mining escolhe território sem privilegiar automaticamente função.
- História possui todos os componentes obrigatórios e 15–25 s.
- Nenhuma narração é solicitada.
- IA não inventa asset IDs nem coordenadas.
- Resolver reutiliza biblioteca antes de qualquer aquisição externa.
- Hunter só usa fontes/políticas permitidas, registra proveniência e não excede orçamento normal de aquisições.
- Elementos simples podem ser satisfeitos proceduralmente.
- Admin mostra uma ideia, assets, lacunas e custo previsto.
- `Outra ideia` funciona sob demanda.
- Nenhuma geração de imagem/vídeo paga acontece silenciosamente acima do limite configurado.
