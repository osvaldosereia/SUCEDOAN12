# Cadastro mobile de produtos — instalação

Esta pasta contém dois arquivos principais:

- `index.html`: aplicativo independente, leve e priorizado para celular.
- `cadastro-produtos-3-fotos-make.blueprint.json`: cenário para importar no Make.

## 1. Importar o cenário no Make

1. Crie um cenário vazio.
2. Use **Import blueprint** e selecione o arquivo do cenário.
3. No módulo **1**, crie um novo webhook.
4. No módulo **3**, preencha somente:
   - `OPENAI_API_KEY`
   - `GITHUB_TOKEN`
5. No módulo **12**, selecione sua conexão OpenAI.
6. Salve o cenário e deixe-o ativo.

O cenário responde ao celular imediatamente e continua trabalhando. O andamento é salvo em `/cadastros_ia_jobs/{job_id}` no Firebase, evitando timeout enquanto pesquisa o produto e gera a imagem.

## 2. Configurar o aplicativo

1. Use `index.html` em uma hospedagem HTTPS. Se o GitHub Pages deste repositório estiver habilitado, o endereço será `https://osvaldosereia.github.io/SUCEDOAN12/cadastro/`.
2. Abra no celular.
3. Toque na engrenagem.
4. Confirme:
   - Firebase: `https://cedar-chemist-310801-default-rtdb.firebaseio.com`
   - Nó: `produtos`
   - Webhook: cole a URL criada no módulo 1 do Make.
5. Salve.

## 3. Funcionamento

1. Leia ou digite o EAN.
2. Se o produto existir, o aplicativo abre nome, estoque, validade, EAN, NCM, gôndola e prateleira para atualização direta no Firebase.
3. Se não existir, tire:
   - foto da frente;
   - foto do EAN;
   - foto da validade.
4. Escolha categoria e subcategoria e envie.
5. A automação:
   - lê as três fotos;
   - pesquisa nome e NCM na web;
   - gera uma capa fiel em WEBP;
   - salva a imagem no GitHub;
   - salva o produto no Firebase;
   - informa a conclusão no celular.

## Segurança do cadastro

Todo produto novo entra com `situacao: "I"`, preço e custo zerados. Se a confiança do NCM ficar abaixo de 85%, o campo `ncm` permanece vazio e a sugestão fica em `ncm_sugerido`. Antes de ativar o produto no site, confira preço, custo e NCM.

As chaves da OpenAI e do GitHub não ficam no HTML. Elas permanecem no cenário do Make.
