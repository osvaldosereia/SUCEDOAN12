# Admin de cestas preparado para WhatsApp Flow

## Objetivo
Preparar o Admin Vitrine para que a configuração de tamanhos e tipos de produto possa ser usada por um Flow de atendimento, com ordem explícita, escolha simples ou múltipla por tipo, quantidades dentro do limite do piloto e prévia de fotos/preços atuais.

## Etapas
1. Persistir configurações próprias do Flow para tamanhos e tipos de produto, sem alterar o preço, estoque ou composição comercial automaticamente.
2. Acrescentar uma aba de configuração do Flow no Admin existente; mostrar fotos e preços atuais dos produtos; permitir ordenar etapas e escolher modo de seleção.
3. Validar o contrato e exibir impedimentos de configuração. Preços serão lidos do catálogo/cotação, nunca editados manualmente nessa aba.
4. Manter o Flow Meta em rascunho até o JSON e os componentes visuais serem validados pela Meta.

## Limites de segurança
- Não alterar estoque, preço, pedidos, Bling ou o catálogo público como efeito de configuração do Flow.
- Não ativar/publicar o Flow para clientes nem implantar o endpoint Meta.
- Preservar a página pública em manutenção e o acompanhamento dos pedidos.
