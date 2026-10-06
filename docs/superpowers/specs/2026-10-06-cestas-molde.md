# Cestas Molde — Especificação aprovada

## Objetivo

Simplificar a operação de cestas da Dona Antônia para o modelo **Cesta Molde → Posições → Opções de Produto**, escondendo kits internos da operação diária.

## Conceitos

- **Cesta molde:** extensão 1:1 da cesta comercial já existente em `basket_templates`.
- **Posição:** papel de um item dentro do molde, por exemplo `Arroz 5 kg`, com quantidade obrigatória por cesta.
- **Opções/variações:** produtos permitidos para preencher uma posição, por exemplo Bonini, Koblenz, Alvino e Caiabi para `Arroz 5 kg`.
- **Valor oculto fixo:** valor comercial do molde que deve permanecer constante independentemente das substituições feitas pelo cliente. Na nova arquitetura ele é armazenado separadamente do campo legado `basket_templates.hidden_adjustment` durante a transição.
- **Composições públicas:** cada molde define quantas versões diferentes o site deve apresentar: **1, 2, 3 ou 4**.

## Regras globais

1. O novo domínio não altera nem recalcula estoque físico, reservas, lotes ou pedidos na Rodada 1.
2. O checkout e os lotes existentes continuam sendo a fonte operacional até as rodadas posteriores fazerem a integração gradual.
3. Cada posição deve ter quantidade maior que zero e pelo menos uma opção de produto.
4. Um mesmo produto não pode aparecer duas vezes como opção da mesma posição.
5. `public_composition_count` aceita somente 1, 2, 3 ou 4.
6. Produtos vinculados às opções referenciam `public.products`; desativar um produto no futuro não apaga a configuração do molde — o gerador posterior apenas o tornará inelegível.
7. Nenhuma visualização pública reserva estoque; essa regra será implementada nas rodadas posteriores.
8. Novas tabelas no schema `public` usam RLS e não concedem acesso a `anon` ou `authenticated`; a operação administrativa é `service_role`.

## Escopo da Rodada 1

- Persistência de `basket_molds`.
- Persistência de `basket_mold_positions`.
- Persistência de `basket_mold_position_options`.
- Leitura completa de um molde com posições e opções.
- Salvamento transacional de um molde completo.
- Validação de 1–4 composições públicas.
- Validação de posições, quantidades e produtos duplicados.
- Segurança `service_role only`.
- Nenhuma migração automática das cestas existentes nesta rodada.
