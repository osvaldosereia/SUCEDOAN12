# Ame Mais — Design

## Objetivo
Criar um miniaplicativo mobile de teste para artigos católicos sem EAN. O operador fotografa um produto e recebe nomenclatura padronizada, descrição de cadastro, descrição comercial e três imagens de vitrine, com compartilhamento no WhatsApp.

## Fluxo
1. Login pelo mesmo PIN do Admin V3.
2. Foto pela câmera ou galeria.
3. GPT-5.6 Luna analisa a imagem e devolve cinco características: tipo, devoção/tema, material/modelo, cor/acabamento e diferencial/tamanho.
4. Se a confiança ficar baixa, a análise escala para GPT-5.6 Terra.
5. A aplicação devolve nome pesquisável, descrição objetiva de cadastro, descrição comercial de vitrine e termos de busca.
6. GPT-Image-2.5 Sunburst gera três imagens separadas a partir da foto original: principal em fundo #ECECEC, ambientada de e-commerce e detalhe comercial.
7. Cada imagem é validada por visão antes de ser liberada; a principal exige fidelidade maior.
8. As imagens aprovadas são armazenadas em `product-images/ame-mais/...`.
9. O usuário pode editar os textos, copiar e compartilhar no WhatsApp. Nesta versão não há gravação do produto na tabela de catálogo.

## Segurança
A chave da OpenAI existe apenas na Edge Function. A função exige JWT válido e confirma que o usuário está ativo em `admin_users` com papel `owner` ou `admin`. O frontend usa apenas a publishable key já existente no Admin V3.

## Regras de catálogo
A IA nunca deve inventar santo, devoção, material, tamanho, medida ou variante. Se a confiança da devoção for menor que 90%, a devoção é removida do campo e o item é marcado para revisão.

## Interface
Mobile-first, câmera como ação principal, preview grande, progresso por etapa, campos editáveis e cards quadrados para as três imagens. O compartilhamento usa Web Share com arquivos quando suportado e cai para WhatsApp com texto e links quando necessário.
