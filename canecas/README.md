# Estúdio A4 de Artes para Canecas

Aplicação publicada em `canecas/index.html`.

## Estrutura

- `index.html`: interface principal.
- `assets/styles.css`: estilos da aplicação e impressão A4.
- `assets/app-loader.js`: carrega o código da aplicação.
- `assets/app-part-1.jsfrag`, `app-part-2.jsfrag` e `app-part-3.jsfrag`: montagem, geração via Make, biblioteca local, PDF, impressão e redimensionamento independente das quatro artes.
- `make/CANECAS_GERAR_ARTE_OPENAI_WEBHOOK.blueprint.json`: blueprint para importar no Make.
- `make/teste-payload-canecas.json`: payload de teste do webhook.
- `imagens/propagandas/`: criada automaticamente quando a primeira propaganda for salva pelo aplicativo.
- `imagens/artes-geradas/AAAA-MM-DD/`: criada automaticamente quando as artes forem salvas pelo aplicativo.

## Configuração inicial

1. Importe o blueprint no Make.
2. Crie o Custom Webhook e conecte a conta OpenAI.
3. Abra a aplicação e informe a URL do webhook em **Integrações**.
4. Para salvar imagens no GitHub, informe um token refinado com permissão de leitura e gravação em Contents somente no repositório `osvaldosereia/SUCEDOAN12`.

O token do GitHub fica apenas na aba atual do navegador e não é gravado nos arquivos do repositório.
