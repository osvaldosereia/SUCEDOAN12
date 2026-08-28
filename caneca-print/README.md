# Caneca Print — Epson L1250

Ferramenta interna para visualizar, baixar e imprimir somente a arte horizontal das canecas.

## Fluxo

1. O Caneca Print consulta as canecas ativas no Firebase.
2. `caneca-print/index.html` mostra somente a arte horizontal de cada caneca.
3. O botão **IMPRIMIR ARTE** envia somente a arte horizontal para a impressão.
4. A arte é espelhada pela própria página e rotacionada 90 graus para o papel vertical.
5. O botão **BAIXAR ARTE** baixa a mesma arte horizontal usada na impressão.
6. O atalho `abrir-caneca-print.bat` abre o Chrome com `--kiosk-printing`, eliminando o painel de impressão.

Mockups não são carregados, exibidos nem necessários no Caneca Print.

## Papel e área de impressão

A página atual usa papel personalizado **106 × 247 mm**, orientação retrato, com a arte impressa em **235 × 106 mm** e centralizada. O próprio sistema faz o espelhamento; por isso, `Mirror Image` deve permanecer desativado no driver.

## Preset recomendado no Windows

- Tamanho: **106,0 × 247,0 mm**.
- Orientação: **Retrato**.
- Escala: **100%**, sem Ajustar à página/Fit to Page.
- `Mirror Image`: **desativado**.
- Qualidade: **Alta**.
- `Bidirectional Printing` / High Speed: **desativado**, quando disponível, para priorizar qualidade.
- O tipo de mídia e a correção de cor devem seguir o papel, tinta sublimática e perfil ICC efetivamente usados na Epson L1250.

## Impressão com um clique

1. Defina a Epson L1250 como impressora padrão do Windows.
2. Desative **Permitir que o Windows gerencie minha impressora padrão**.
3. Salve o preset acima como padrão da Epson L1250.
4. Abra a ferramenta pelo arquivo `abrir-caneca-print.bat`.

O parâmetro `--kiosk-printing` do Chrome faz `window.print()` imprimir diretamente usando a impressora/configuração padrão, sem abrir o preview do navegador.

## QZ Tray

QZ Tray pode ser adotado numa segunda etapa caso seja necessário selecionar explicitamente a impressora pelo nome, consultar impressoras/status ou controlar trabalhos por um agente local. Para impressão silenciosa sem avisos, o QZ exige assinatura/certificado confiável; a chave privada nunca deve ser armazenada neste repositório.
