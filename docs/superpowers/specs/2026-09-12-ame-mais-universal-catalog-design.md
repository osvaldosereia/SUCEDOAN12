# Ame Mais Universal Catalog — Design

## Goal
Transformar o Ame Mais em um aplicativo público, mobile-first e sem login para fotografar qualquer tipo de artigo católico, analisar o produto com OpenAI, gerar nomenclatura e descrições padronizadas, criar três imagens comerciais ultrarrealistas adaptadas ao tipo do produto, persistir todo o histórico no Supabase e apresentar uma simulação funcional de card de e-commerce reutilizável em outros pontos do sistema.

## Branding
- Usar apenas a logo Ame+ Store fornecida pelo usuário.
- A logo aparece no canto superior esquerdo do aplicativo e do card de simulação.
- Não introduzir outra marca visual no Ame Mais.
- A logo será armazenada no repositório como ativo próprio do Ame Mais e poderá também ser copiada para o bucket `ame-mais` para reutilização.

## Access Model
- O Ame Mais não exige login, senha ou PIN.
- A Edge Function continua com `verify_jwt=false`, mas mantém:
  - allowlist de origens conhecidas;
  - rate limiting por fingerprint derivado de IP + user-agent;
  - chave OpenAI somente no backend;
  - service role somente no backend.
- Nenhuma tabela operacional do Ame Mais é exposta diretamente para escrita do navegador. O navegador fala apenas com a Edge Function.

## Product Analysis
Cada execução começa com uma foto original e produz dados estruturados com as cinco características fixas:
1. `tipo_produto`
2. `devocao_tema`
3. `material_modelo`
4. `cor_acabamento`
5. `diferencial_tamanho`

Além disso, a análise produz:
- `nome_cadastro`
- `descricao_cadastro`
- `descricao_vitrine`
- `termos_busca`
- `confianca_geral`
- `confianca_devocao`
- `precisa_revisao`
- `motivo_revisao`
- `conflitos`
- `observacoes`

Regras:
- A foto original é a verdade visual.
- Nunca inventar santo, devoção, material, medida, acabamento, estampa, inscrição ou parte não visível.
- Devoção abaixo de 90% de confiança não entra no nome como certeza.
- A descrição de cadastro é objetiva e orientada a busca manual.
- A descrição de vitrine é curta, comercial e voltada à venda.

## Universal 3-Image Engine
Todo produto deve terminar com exatamente três imagens comerciais quadradas.

### Global image rules
- 1024×1024.
- Qualidade de geração configurada como `low` para controle de custo, mantendo o prompt orientado a aparência ultrarrealista.
- Fotografias com aparência real: textura física, materiais plausíveis, iluminação natural/profissional, nitidez alta, microdetalhes e profundidade coerente.
- A identidade do produto deve permanecer fiel à referência.
- Não gerar mais a antiga imagem principal com fundo cinza.
- Cada imagem passa por validação visual contra a foto original.
- Em caso de reprovação, uma segunda tentativa pode ser feita; se ainda reprovar, a imagem fica marcada para refazer manualmente.

### Scene profiles
O motor escolhe um perfil pelo `tipo_produto` normalizado.

#### Terço / Rosário
1. `hero`: mão humana segurando o terço/rosário e posando para a câmera, produto inteiro reconhecível e protagonista.
2. `lifestyle`: mockup realista mostrando o produto em uso/contexto devocional humano, sem descaracterizar o item.
3. `detail`: close-up macro de um detalhe real existente, como medalha, contas, crucifixo ou acabamento.

#### Camiseta
1. `hero`: pessoa real vestindo a camiseta, estampa e caimento fiéis.
2. `lifestyle`: contexto de uso/lifestyle com a camiseta como protagonista.
3. `detail`: close-up da estampa, tecido, costura ou acabamento visível.

#### Estátua / Imagem religiosa
1. `hero`: peça em ambientação devocional realista e limpa.
2. `lifestyle`: peça integrada a ambiente doméstico/religioso elegante.
3. `detail`: close-up de rosto, pintura, textura ou acabamento existente.

#### Quadro
1. `hero`: quadro aplicado em parede realista e proporcional.
2. `lifestyle`: ambiente decorado completo, mantendo o quadro em destaque.
3. `detail`: close-up da arte, moldura, textura ou acabamento.

#### Chaveiro
1. `hero`: mão segurando o chaveiro para a câmera.
2. `lifestyle`: chaveiro aplicado em chave, bolsa ou objeto compatível.
3. `detail`: close-up do pingente, medalha, impressão ou ferragem.

#### Demais tipos
1. `hero`: produto em contexto de e-commerce realista, inteiro e protagonista.
2. `lifestyle`: uso/aplicação plausível do mesmo produto.
3. `detail`: close-up de um detalhe visível real.

O perfil é configurável em código e deve permitir novos tipos sem alterar o fluxo principal.

## Persistence Model
O bucket público `ame-mais` permanece sendo o repositório de mídia. Cada execução usa:

- `runs/<run_id>/original.jpg`
- `runs/<run_id>/hero.webp`
- `runs/<run_id>/lifestyle.webp`
- `runs/<run_id>/detail.webp`
- `runs/<run_id>/result.json`

A tabela `ame_mais_runs` é expandida para armazenar o estado completo da criação, incluindo:
- análise estruturada;
- conflitos e observações;
- prompts usados;
- perfil visual escolhido;
- três imagens e validações;
- `card_json` reutilizável;
- status e etapa atual;
- timestamps.

Uma tabela `ame_mais_images` registra cada imagem individualmente para facilitar histórico, reprocessamento e reutilização por outras telas.

## Reusable E-commerce Card
Cada execução completa produz um `card_json` estável com:
- run id;
- logo URL;
- nome do produto;
- descrição comercial;
- descrição de cadastro;
- cinco características;
- termos de busca;
- conflitos/alertas;
- galeria com as três imagens em ordem hero → lifestyle → detail;
- imagem ativa;
- dados de confiança;
- links de download.

Na interface, o card deve simular um produto real de loja:
- logo Ame+ Store no canto superior esquerdo;
- imagem principal grande;
- três miniaturas clicáveis para trocar a imagem ativa;
- nome;
- descrição comercial;
- atributos resumidos;
- área expansível com descrição de cadastro, termos de busca e alertas;
- baixar imagem ativa;
- baixar cada uma das três imagens;
- copiar nome;
- copiar descrição;
- compartilhar no WhatsApp;
- iniciar nova criação.

O card é renderizado por função isolada para poder ser reutilizado em outras páginas sem depender da tela principal do Ame Mais.

## Processing UX
O usuário vê o processamento por etapas reais:
1. Preparando foto
2. Salvando original
3. Analisando produto
4. Criando nome
5. Criando descrição de cadastro
6. Criando descrição comercial
7. Escolhendo perfil visual
8. Gerando foto 1
9. Validando foto 1
10. Salvando foto 1
11. Gerando foto 2
12. Validando foto 2
13. Salvando foto 2
14. Gerando foto 3
15. Validando foto 3
16. Salvando foto 3
17. Montando card
18. Concluído

A tela não deve permanecer indefinidamente numa etapa silenciosa. Erros são exibidos na própria etapa com opção de refazer a imagem afetada.

## Backend
A Edge Function `ame-mais-analyze-v1` continua sendo a única porta pública.

Ações:
- `analyze`: salva original, analisa produto, escolhe perfil de cenas e devolve textos estruturados.
- `generate_image`: gera uma das três imagens pelo `kind` (`hero`, `lifestyle`, `detail`).
- `status`: retorna o estado persistido da execução.
- `get_run`: retorna uma criação completa pelo `run_id` para abrir em outras telas.

A função resolve a chave OpenAI primeiro por `OPENAI_API_KEY` e, se ausente, pelo RPC seguro de Vault já existente no projeto.

## Validation
Cada imagem é comparada com a referência original por visão:
- mesmo produto;
- cor compatível;
- forma compatível;
- símbolos/identidade visual preservados;
- detalhes religiosos não trocados;
- sem invenção de inscrições ou acessórios críticos.

A imagem `hero` exige limiar maior que as cenas lifestyle/detail.

## Logo Asset
A imagem enviada pelo usuário será incorporada ao repositório sem redesenho. Como o conector GitHub aceita blobs base64, o arquivo será salvo em `ame-mais/assets/logo-ame-store.jpg`. O frontend referencia esse arquivo diretamente.

## Success Criteria
- Nenhum login/PIN.
- Foto chega ao backend e sai da etapa inicial em poucos segundos quando a rede responde.
- Todo produto analisado recebe exatamente três slots de imagem.
- Perfis específicos funcionam para terço/rosário, camiseta, estátua/imagem, quadro, chaveiro e fallback universal.
- Todas as imagens e informações ficam persistidas no Supabase.
- Uma criação completa pode ser reaberta pelo `run_id`.
- O card funcional troca imagens e oferece downloads e compartilhamento.
- A logo usada é apenas a Ame+ Store fornecida.
- Testes automatizados cobrem roteamento de tipo, três cenas, persistência/card model e regressão do acesso à chave OpenAI.
