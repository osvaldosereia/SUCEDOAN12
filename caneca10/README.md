# Caneca 10

Gerador interno mobile de canecas da Dona Antônia.

## Caminho oficial

O caminho canônico é `caneca10/index.html`.

A grafia antiga `ceneca10` foi removida do runtime e dos testes do GitHub para evitar duplicidade, referências divergentes e manutenção em dois lugares.

## Arquitetura atual

O Caneca10 trabalha internamente somente com a arte horizontal final:

1. imagem de inspiração;
2. comandos salvos + instrução complementar;
3. `generate_mug_art`;
4. recuperação da arte intermediária quando necessário;
5. catalogação visual opcional e não bloqueante;
6. fechamento da arte em 2400 × 960;
7. publicação da arte horizontal;
8. produto salvo inicialmente como inativo e como modelo interno;
9. exibição somente da arte horizontal final.

Mockups não fazem parte da interface nem do cadastro interno final do Caneca10.

## Compatibilidade temporária com o Make

Até o cenário do Make ser atualizado para o novo contrato de arte única, o frontend ainda envia as três referências exigidas pelo fluxo legado de `finalize_mug_product`. Os mockups eventualmente gerados pelo cenário atual não são exibidos pelo Caneca10 e são removidos do cadastro interno final.

Quando o cenário do Make for atualizado, essa camada de compatibilidade poderá ser removida sem alterar a interface do Caneca10.

## Runtime ativo

- `../shared/mug-make-fast-ack-v1.js`: transporte compartilhado;
- `art-recovery-v1.js`: recuperação da arte intermediária pelo Firebase;
- `app-v4-clean.js`: controlador único do gerador mobile;
- `gallery-v4.js`: modelos, histórico, filtros, reutilização e exclusão segura.

## Dados compartilhados

- Firebase: o mesmo projeto do Produção;
- comandos: `canecas/comandos_criacao`;
- modelos: `canecas/modelos_criacao`;
- produtos: `produtos`;
- recuperação temporária: `canecas/geracoes`;
- webhook Make: o mesmo utilizado pelo Produção.

## Exclusão segura

Ao apagar uma caneca pelo mobile, o cadastro é arquivado primeiro em `produtos_excluidos` e depois removido de `/produtos` e dos nós de modelo/personalização no Firebase.

Os arquivos de imagem já gravados fisicamente no GitHub não são apagados pelo navegador, porque isso exigiria expor uma credencial de escrita no frontend. Essa credencial permanece fora do código público.
