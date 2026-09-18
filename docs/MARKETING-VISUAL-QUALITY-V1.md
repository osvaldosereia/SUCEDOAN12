# Marketing Visual Quality V1

Atualizado em 18/09/2026.

## Problema encontrado na homologação

A campanha piloto "Ofertas de Limpeza" escolhia o Veja X-14 como hero por força comercial, mas a imagem atual do produto vinha de uma fonte legacy `info-lado-a-lado` e o cadastro estava com `image_ai_status=rejected`.

Na mesma campanha havia alternativas visuais melhores:
- Ypê 5 L: imagem AI concluída e validação profissional;
- Condor Vassoura: imagem AI concluída e validação profissional.

## Regra nova

O Marketing Brain continua escolhendo os produtos por estratégia comercial, mas a escolha do hero visual considera qualidade da mídia.

Pontuação visual favorece:
- `image_ai_status=completed`;
- foto profissional;
- produto completo;
- sombra natural;
- fidelidade >= 0,90;
- composição >= 0,90;
- fonte web pesquisada/verificada.

Penaliza:
- `image_ai_status=rejected`;
- revisão manual pendente;
- nomes/URLs com lado-a-lado, comparativo, montagem, banner, etiqueta ou tabela;
- ausência de imagem.

Se houver pelo menos dois produtos visualmente prontos, peças automáticas usam esse subconjunto. Produtos comercialmente selecionados não são apagados da campanha; apenas deixam de ser usados automaticamente em criativos ruins.

## Piloto corrigido

Hero visual: Água Sanitária Cloro Ativo Ypê 5 L.

O Veja X-14 permanece no cadastro/campanha, mas foi excluído da composição automática piloto enquanto sua imagem estiver rejeitada.

## Custos

Esta regra é totalmente determinística e não chama OpenAI.
