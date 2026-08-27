# Caneca 10

Gerador interno mobile de canecas da Dona Antônia.

## Caminho oficial

O caminho canônico é `caneca10/index.html`.

A grafia antiga `ceneca10` foi removida do runtime e dos testes do GitHub para evitar duplicidade, referências divergentes e manutenção em dois lugares.

## Arquitetura

O Caneca10 usa o mesmo núcleo funcional do Criador de Canecas do Produção:

1. imagem de inspiração;
2. comandos salvos + instrução complementar;
3. `generate_mug_art`;
4. recuperação da arte intermediária em `canecas/geracoes/{request_id}` quando o Make responde `Accepted` ou a conexão síncrona cai;
5. catalogação visual opcional e não bloqueante;
6. fechamento da arte em 2400 × 960;
7. geração de três referências (esquerda, direita e centro);
8. `finalize_mug_product`;
9. qualidade efetiva LOW forçada pelo transporte compartilhado;
10. finalização assíncrona com acompanhamento pelo Firebase;
11. produto salvo inicialmente como inativo e como modelo interno;
12. arte horizontal + 3 mockups exibidos sem necessidade de F5.

## Runtime ativo

- `../shared/mug-make-fast-ack-v1.js`: força `quality = low` e libera a finalização com ACK de contingência;
- `art-recovery-v1.js`: recupera a arte intermediária pelo Firebase;
- `app-v4-clean.js`: controlador único do gerador mobile;
- `gallery-v4.js`: modelos, histórico, filtros, reutilização e exclusão segura.

Não são necessários guards antigos, compatibilizadores de resposta nem refreshes paralelos de galeria.

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
