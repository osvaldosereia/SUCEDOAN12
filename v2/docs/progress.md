# Progresso da reconstrução V2

## Fundação concluída

- configuração central de ambiente;
- catálogo compartilhado e seguro;
- bloqueio de catálogo vazio;
- detecção de queda anormal e IDs duplicados;
- cache controlado;
- carrinho compartilhado;
- favoritos compartilhados;
- roteamento por hash;
- página inicial de catálogo;
- busca e filtro por categoria;
- detalhe do produto;
- painel de favoritos;
- carrinho lateral;
- painel administrativo inicial somente leitura;
- testes básicos de catálogo, favoritos e rotas.

## Regras de segurança mantidas

- desenvolvimento somente na branch `rebuild-v2`;
- arquivos novos somente dentro de `v2/`;
- nenhuma alteração na branch `main`;
- nenhuma escrita no Firebase;
- nenhum webhook real acionado;
- checkout permanece bloqueado em homologação.

## Próximas etapas

1. sessões da página inicial e categorias;
2. paginação ou carregamento progressivo;
3. ofertas, cestas e kits com contratos de dados próprios;
4. Compra rápida baseada apenas em referências de produtos;
5. checkout de homologação sem envio externo;
6. fila local de pedidos e validação do payload;
7. integração controlada com ambiente de teste;
8. admin modular com edição e auditoria.
