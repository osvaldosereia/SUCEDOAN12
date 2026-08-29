# Admin Canecas

Admin operacional separado do Produção para toda a jornada das canecas. Ele **não possui uma cópia do catálogo**: lê e grava o mesmo `/produtos/{id}` do Firebase usado pelo Produção.

## Caminho

`/admin-canecas/`

## Áreas

- **Início**: prioridades, pagos, impressão e erros.
- **Pedidos**: pedidos do nó `canecas/pedidos` e detecção dos pedidos gerais da Dona Antônia que contenham canecas.
- **Criações**: `canecas/personalizadas`, atendimento e criação manual de pedido.
- **Gerador oficial**: abre o `mug-studio` do Produção no próprio Admin Canecas; biblioteca, criador de comandos, Make e Firebase continuam sendo exatamente os mesmos.
- **Canecas**: edição por PATCH do mesmo registro em `/produtos`; contém proteção simples contra sobrescrever uma versão alterada em outro painel.
- **Impressão**: incorpora o Caneca Print, cuja fila fica em `canecas/print_jobs`.
- **Configurações**: URLs de webhooks operacionais. Tokens e segredos não devem ser colocados no frontend.

## Exportação para Loja Integrada

A área **Canecas** possui exportação em massa para a planilha oficial da Loja Integrada:

- seleção individual ou de todas as canecas visíveis;
- botão **Baixar selecionadas**;
- botão **Baixar todas ativas**;
- arquivo `.xlsx` gerado no navegador, sem dependência de biblioteca externa;
- exatamente as 49 colunas do modelo oficial, na mesma ordem;
- mapeamento de SKU, status, NCM, GTIN, SEO, descrição, estoque, preço, marca, peso, dimensões, categorias e até cinco imagens;
- validação de campos críticos antes da geração;
- avisos para segunda imagem, peso/dimensões e SEO;
- registro em `/produtos/{id}/lojaintegrada` da data, arquivo, fingerprint e versão do template da última planilha gerada;
- indicação visual de **Não gerada**, **Planilha gerada** ou **Alterada depois**.

O status salvo significa apenas que uma planilha foi gerada. Ele **não confirma que o produto foi importado pela Loja Integrada**.

## Nós Firebase

Contrato compartilhado em `../shared/mug-commerce-v1.js`:

- `produtos`
- `canecas/personalizadas`
- `canecas/modelos_criacao`
- `canecas/modelos_privados`
- `canecas/pedidos`
- `canecas/print_jobs`
- `canecas/auditoria`
- `canecas/integracoes`

## Pedido

O pedido de caneca mantém estados separados para comercial, pagamento, Bling, NF-e, produção e Melhor Envio. Confirmar pagamento no Admin cria jobs de impressão somente quando existe arte horizontal localizada/aprovada.

## Print job

Cada job contém origem, pedido, cliente, produto, quantidade e uma **URL congelada da arte aprovada**. Isso evita que uma edição posterior do produto troque silenciosamente a arte que deveria ser impressa.

## Dona Antônia + CanecaFácil

`origem` aceita `dona_antonia` ou `canecafacil`. O Caneca Print mostra essa origem com destaque em cada card. Pedidos gerais da Dona Antônia que contenham canecas podem ser importados para `canecas/pedidos` antes de entrar na fila.

## Integrações

O admin está pronto para acionar webhooks de:

- pedido confirmado → Bling;
- cotação → Melhor Envio;
- preparação/compra de frete → Melhor Envio.

Client Secret, access tokens e chaves privadas devem ficar no Make/Firebase Functions/ambiente de servidor, nunca em arquivos GitHub publicados.
