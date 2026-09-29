# Vitrine/Admin — revisão mobile responsiva

Data: 2026-09-29

## Motivo

O Admin possuía diversas regras desktop sendo comprimidas no celular. O caso mais grave estava no Balanço:
- linhas recebiam `grid-template-columns`, porém continuavam com `display:flex`;
- textos longos disputavam a mesma linha com inputs e botões;
- a top bar tentava manter logo, marca, operador e link da vitrine numa única linha;
- regra mobile genérica de `.list-row` assumia que toda lista possuía uma primeira coluna de 52 px, o que quebrava especialmente Clientes e Pedidos;
- diversos textos `.sub` permaneciam em `white-space: nowrap`.

## Mobile Operational UI V5

Commit: `013d432cfec120105b63501ae7d3da400dea2754`

### Top bar
- grid responsivo no mobile;
- logo, nome e operador não competem mais horizontalmente;
- link da vitrine ocupa linha própria;
- tabs continuam horizontais com scroll;
- tamanhos mínimos de toque preservados;
- suporte a safe-area.

### Estrutura geral
- page headers passam a empilhar corretamente;
- toolbars e forms viram uma coluna quando necessário;
- textos longos usam quebra normal;
- botões não ficam comprimidos;
- dialogs usam praticamente toda a viewport móvel com ações empilhadas;
- alertas operacionais deixam de disputar espaço horizontal.

### Balanço
Foram criadas classes semânticas:
- `balance-photo-panel`;
- `balance-pending-panel`;
- `balance-tool-grid`;
- `inventory-upload-row`;
- `inventory-pending-row`;
- `inventory-review-row`.

No celular:
- upload de fotos vira card legível;
- status fica separado da ação;
- ESTOQUE e GÔNDOLA ficam lado a lado em campos grandes;
- ações ocupam largura total;
- review/confirmar não disputa linha com texto;
- teclado numérico e scanner usam dimensões adequadas;
- botões de aplicar/cancelar/reler usam largura total.

## Mobile V5.1 — layouts por módulo

Commit: `d0b606efbaadc8d16419757d252f07453eda44fd`

Foi removida a dependência visual da regra genérica de 52 px para os módulos principais.

### Produtos
- foto continua em coluna fixa;
- nome/classificação ocupam largura útil;
- preço e editar ficam em linha própria;
- textos auxiliares podem quebrar linha.

### Clientes
- nome/e-mail ocupam largura total;
- telefone e ações ficam organizados abaixo;
- nome do cliente não fica mais preso em coluna de 52 px.

### Pedidos
- pedido e total no topo;
- cliente/status em linha própria;
- próxima ação ocupa largura total;
- botões Abrir/Solicitar dados ficam em grade móvel.

### Compras/XML
- documentos e revisão viram cards de uma coluna;
- ações passam a ocupar largura total;
- detalhes de preços reduzem progressivamente até uma coluna.

### Expedição / Fechamento / Central
- linhas operacionais viram cards de uma coluna no celular;
- ações são organizadas em grade e não ficam sobrepostas.

### Gôndolas
- toolbar empilhada;
- cards em 2 colunas e 1 coluna em celulares pequenos.

### Validades e históricos
- mantém informação principal sem overflow;
- textos longos quebram linha;
- controles não escapam do viewport.

## Validação

- JavaScript inline: sintaxe válida.
- CSS: chaves balanceadas (0).
- nenhum bloco CSS fechando em profundidade negativa.
- GitHub Pages:
  - commit `013d432c...`: deploy success;
  - commit `d0b606ef...`: deploy success.

## Próximo teste visual

A validação estrutural foi concluída, mas a experiência real deve ser conferida em pelo menos:
- celular ~360/390 px;
- celular ~430 px;
- tablet.

Se algum componente específico ainda estiver inadequado, usar screenshot real para ajuste fino sem voltar ao modelo de tabela desktop comprimida.


## Continuação da revisão — V5.2/V5.3

### Top bar mobile
- cabeçalho reorganizado para duas linhas úteis;
- operador não disputa mais espaço com o nome completo da aplicação;
- no celular, o prefixo "Operador:" é ocultado e aparece apenas o nome/Identificar;
- botão de vitrine ocupa uma linha própria;
- tabs continuam horizontais e a aba ativa passa a rolar automaticamente para o centro da faixa visível;
- proteção adicional contra overflow horizontal.

### Balanço
- linhas de upload, conferência e pendência passaram a usar grids próprios em vez de herdar `display:flex` de `.simple-row`;
- campos de ESTOQUE e GÔNDOLA são maiores no celular;
- ESTOQUE e GÔNDOLA agora possuem rótulos explícitos acima dos campos;
- botões principais usam largura total quando necessário;
- status e textos longos quebram linha sem sobreposição;
- cards de revisão deixam produto em uma linha e controles em área própria;
- telas abaixo de 390 px usam uma coluna quando duas colunas ficariam apertadas.

### Demais módulos
- Produtos: card compacto com foto, nome, dados principais e ação separada;
- Clientes: dados e ações sem colisão;
- Pedidos: valor, dados, próxima ação e botões em áreas distintas;
- Compras/XML: documentos e revisão viram cards de uma coluna;
- Central/Expedição/Fechamento: linhas largas passam a cards verticais;
- Validades: campos e ações ocupam linhas legíveis;
- Gôndolas: toolbar empilha e cards adaptam 2→1 coluna em telas pequenas;
- modais e ações ficam em uma coluna no celular;
- cabeçalhos de tabela desktop continuam ocultos em telas pequenas.

### Commits complementares
- `d0b606efbaadc8d16419757d252f07453eda44fd` — cards mobile por módulo;
- `d53ded2e8daf544212051055c7ef5b349dc5cec7` — simplificação da top bar e tab ativa visível;
- `064785371eaf7d2137d9f2168bc618ce0917fd00` — rótulos claros ESTOQUE/GÔNDOLA no Balanço.

### Validação
- JavaScript inline compilou sem erro após as mudanças;
- regras mobile finais ficam no fim do stylesheet e, portanto, têm precedência sobre estilos responsivos antigos;
- alterações são limitadas por media queries para preservar o desktop.
