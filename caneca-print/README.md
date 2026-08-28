# Caneca Print — Epson L1250

Ferramenta interna única para as canecas vendidas pela **Dona Antônia** e pelo **CanecaFácil**.

## Modos

### Fila de pedidos — padrão

Lê `canecas/print_jobs` no Firebase. Cada card mostra de forma destacada a origem do pedido (`DONA ANTÔNIA` ou `CANECAFÁCIL`), pedido, cliente, produto, quantidade, versão aprovada da arte e progresso de impressão.

- cada clique imprime uma caneca;
- pedidos com quantidade maior que 1 avançam o contador após cada impressão;
- ao completar a quantidade o job passa para `impresso`;
- uma reimpressão precisa ser liberada explicitamente e registra o motivo;
- o arquivo usado é a URL congelada em `arte_aprovada.url`, para não trocar silenciosamente a versão aprovada.

### Catálogo de artes

Mantém a função anterior para testes, amostras, reposições e impressões manuais. Consulta as canecas ativas em `/produtos` e usa somente a arte horizontal.

## Fluxo de produção

1. Um pedido confirmado/pago cria um job em `canecas/print_jobs`.
2. O Caneca Print abre por padrão na fila.
3. O botão **IMPRIMIR** envia somente a arte horizontal aprovada.
4. A página espelha a arte e rotaciona 90 graus para o papel vertical.
5. O contador de quantidade é atualizado no Firebase após a impressão.
6. Ao completar a quantidade, o trabalho muda para `impresso`.

Mockups não são necessários no Caneca Print.

## Papel e área de impressão

Papel personalizado **106 × 247 mm**, orientação retrato, com arte em **235 × 106 mm** e centralizada. O próprio sistema faz o espelhamento; `Mirror Image` deve permanecer desativado no driver.

## Preset recomendado no Windows

- Tamanho: **106,0 × 247,0 mm**.
- Orientação: **Retrato**.
- Escala: **100%**, sem Ajustar à página/Fit to Page.
- `Mirror Image`: **desativado**.
- Qualidade: **Alta**.
- `Bidirectional Printing` / High Speed: **desativado**, quando disponível.
- Tipo de mídia e correção de cor devem seguir o papel, tinta sublimática e perfil ICC efetivamente usados na Epson L1250.

## Impressão com um clique

1. Defina a Epson L1250 como impressora padrão do Windows.
2. Desative **Permitir que o Windows gerencie minha impressora padrão**.
3. Salve o preset acima como padrão da Epson L1250.
4. Abra pelo `abrir-caneca-print.bat`.

O Chrome com `--kiosk-printing` faz `window.print()` usar a impressora/configuração padrão sem abrir o preview.

## Estrutura compartilhada

Os helpers e o contrato da fila ficam em `shared/mug-commerce-v1.js`. O Admin Canecas cria os jobs, e o Caneca Print apenas executa/acompanha a produção.
