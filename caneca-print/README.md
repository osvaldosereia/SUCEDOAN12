# Caneca Print — Epson L1250

Ferramenta interna para imprimir somente a arte horizontal das canecas cadastradas na categoria `Canecas`.

## Fluxo

1. O GitHub Actions lê as canecas do Firebase e gera `site/canecas-print.json`.
2. `caneca-print/index.html` mostra mockup 1, mockup 2 e arte horizontal.
3. O botão **IMPRIMIR ARTE** envia somente a arte horizontal para a impressão.
4. A arte é espelhada pela própria página e rotacionada 90 graus para o papel vertical.
5. O atalho `abrir-caneca-print.bat` abre o Chrome com `--kiosk-printing`, eliminando o painel de impressão.

## Papel e área segura

- Papel físico: **98 × 247 mm**.
- Orientação: retrato/vertical.
- A Epson L1250 suporta papel definido pelo usuário entre 54 × 86 mm e 215,9 × 1200 mm.
- A margem mínima normal da L1250 é 3 mm em cada lado.
- Por isso, a arte é impressa em **230 × 92 mm**, mantendo a proporção original 2400 × 960 sem deformação e dentro da área imprimível segura.
- A borda estreita de 98 mm entra primeiro no alimentador traseiro.

## Preset recomendado no Windows

Crie uma predefinição no driver da Epson L1250 e deixe-a como padrão da impressora usada pelo PC de produção:

- Tamanho: **98,0 × 247,0 mm** (personalizado).
- Orientação: **Retrato**.
- Escala: **100%**, sem Ajustar à página/Fit to Page.
- `Mirror Image`: **desativado** — o sistema já espelha.
- Qualidade: **Alta**.
- `Bidirectional Printing` / High Speed: **desativado**, quando disponível, para priorizar qualidade.
- Tipo de mídia: siga a recomendação do fabricante do papel/tinta sublimática e do perfil ICC. Como ponto de partida de teste sem ICC, `Premium Presentation Paper Matte` costuma ser a opção de maior depósito/qualidade entre as mídias matte oferecidas pelo driver, mas deve ser validada com o seu papel e tinta.
- Cor: se houver perfil ICC específico para seu conjunto tinta + papel + impressora, siga exatamente a configuração recomendada pelo fornecedor do perfil. Não use duas correções de cor ao mesmo tempo.

## Impressão com um clique

1. Defina a Epson L1250 como impressora padrão do Windows.
2. Desative **Permitir que o Windows gerencie minha impressora padrão**, para evitar que outra impressora vire padrão automaticamente.
3. Salve o preset acima como padrão da Epson L1250.
4. Copie `abrir-caneca-print.bat` para a Área de Trabalho do PC de produção.
5. Abra sempre a ferramenta por esse atalho.

O parâmetro `--kiosk-printing` do Chrome faz `window.print()` imprimir diretamente usando a impressora/configuração padrão, sem abrir o preview do navegador.

## QZ Tray

QZ Tray pode ser adotado numa segunda etapa caso seja necessário selecionar explicitamente a impressora pelo nome, consultar impressoras/status ou controlar trabalhos por um agente local. Para impressão silenciosa sem avisos, o QZ exige assinatura/certificado confiável; a chave privada nunca deve ser armazenada neste repositório.
