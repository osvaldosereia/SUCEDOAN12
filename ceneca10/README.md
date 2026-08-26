# Caneca 10

Versão mobile e independente do Criador de Canecas do Produção.

## Fluxo

1. Escolha uma imagem pela câmera ou galeria.
2. Marque um ou mais comandos salvos do Firebase em `canecas/comandos_criacao`.
3. Opcionalmente escreva uma instrução extra.
4. Toque em **Gerar caneca**.
5. O aplicativo usa o mesmo webhook Make do Criador de Canecas para gerar a arte horizontal, tentar catalogar a arte, gerar três mockups e cadastrar o produto no Firebase.

## Comportamento de segurança operacional

- A catalogação da arte é opcional e nunca bloqueia a geração.
- Se a rota de análise falhar, o aplicativo utiliza um cadastro genérico e continua para os mockups.
- Se o Make retornar os três mockups sem confirmar o salvamento do produto, o aplicativo tenta salvar diretamente no Firebase.
- Os produtos são cadastrados inicialmente como inativos.

## Configuração

O webhook é salvo no navegador usando a mesma chave do Produção: `da_admin_v2_mug_make_webhook`.

No primeiro acesso em um celular novo, toque em **⚙ Configuração** e informe o webhook do cenário Make de canecas.
