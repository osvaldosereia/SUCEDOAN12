# AME MAIS — Loja Integrada — Etapa 1

## Escopo

O AME MAIS é um projeto independente. O fato de estar temporariamente no mesmo repositório de outros projetos não cria dependência funcional, visual ou de dados com Dona Antônia. A integração desta especificação é exclusivamente AME MAIS ↔ Loja Integrada.

## Objetivo

Transformar o AME MAIS em uma ferramenta auxiliar mobile, rápida e segura, para alimentar e gerir operações essenciais da Loja Integrada, preservando o fluxo atual de cadastro inteligente por fotos.

A Loja Integrada será a fonte oficial dos dados comerciais. Supabase será usado como backend seguro, configuração e cache/índice quando necessário; credenciais da Loja Integrada nunca serão expostas no navegador.

## Etapa 1

Quatro áreas principais:

1. **Cadastrar** — EAN opcional por câmera/digitação, 1–3 fotos, análise IA existente, nome, descrição e preço; revisão antes de publicar; envio das imagens geradas; status ativo/inativo.
2. **Produtos** — busca rápida por nome, SKU/EAN e status; lista mobile compacta; abrir produto; editar campos básicos; preço; estoque; ativar/desativar.
3. **Contagem rápida** — leitura por câmera ou leitor EAN compatível com teclado; localizar produto; mostrar estoque atual; informar quantidade física; confirmar; atualizar estoque; voltar imediatamente para próxima leitura. Também suportar incremento unitário.
4. **Integração** — configuração server-side das credenciais da própria Loja Integrada e teste de conexão. O frontend mostra somente estado conectado/desconectado, nunca os segredos.

## Regras de segurança e integridade

- Não excluir produtos na Etapa 1. Somente ativar/desativar.
- Antes de alterar um produto, buscar o estado atual e preservar campos não editados quando a API exigir representação completa.
- Preço e estoque serão tratados pelos recursos próprios da API, não simulados como campos do cadastro.
- Antes de criar, verificar possível produto existente para reduzir duplicidades.
- Toda mutação terá confirmação visual de sucesso/erro.
- Falha de API não deve deixar a interface fingindo que a Loja Integrada foi atualizada.
- Operações de IA não serão usadas em busca, estoque, ativação, listagem ou sincronização.

## Arquitetura

Frontend mobile `amemais/` → nova Edge Function/adaptador de Loja Integrada → API oficial Loja Integrada.

O adaptador isola a API externa do frontend e oferece operações internas estáveis: conexão, listar/buscar/obter/criar/atualizar produto, consultar/alterar preço, consultar/alterar estoque, ativar/desativar e enviar/listar imagens.

O backend atual de geração/análise de imagens permanece separado. A integração comercial não deve aumentar o consumo de IA.

## EAN e índice

O EAN/GTIN será a chave operacional preferencial no mobile, mas não será assumido como identificador primário da Loja Integrada. Quando útil, um índice/cache mínimo manterá a associação entre EAN, SKU e ID remoto para acelerar leituras repetidas. Em qualquer edição crítica, o estado remoto será consultado antes da gravação.

## Interface mobile

A navegação prioriza poucos toques e botões grandes. A tela inicial apresenta Cadastrar, Produtos e Contagem rápida. Busca e leitura EAN devem evitar navegação desnecessária. A lista de produtos será paginada e compacta, exibindo foto, nome, preço, estoque e status.

## Fora da Etapa 1

Pedidos, clientes, checkout, campanhas, relatórios avançados, SEO avançado, variações complexas, exclusão de produto, sincronização com ERP/CISS e automações de marketing ficam fora desta implantação. Webhooks e sincronização avançada podem entrar em fase posterior.

## Testes e aceite

A implementação deve ter testes para normalização/mapeamento de payloads, preservação de campos em atualização, preço/estoque, ativar/desativar e tratamento de erros. O frontend deve ser validado nos fluxos: cadastro, busca/edição, contagem e indisponibilidade da integração. Nenhuma credencial secreta pode aparecer no bundle público.

## Critério de conclusão da Etapa 1

Com credenciais válidas, um operador no celular deve conseguir: localizar um produto, visualizar preço/estoque/status, alterar dados básicos, preço e estoque, ativar/desativar, realizar contagem rápida por EAN e cadastrar um produto novo usando o fluxo inteligente já existente do AME MAIS.