# Caneca 10

Gerador interno mobile de canecas da Dona Antônia.

## Objetivo

O `ceneca10/index.html` é a versão para celular do Criador de Canecas do Produção. Ele usa o mesmo Firebase, os mesmos comandos salvos e o mesmo webhook Make.

## Recursos

- modelos salvos em `canecas/modelos_criacao`;
- restauração dos comandos e da instrução usados no modelo;
- câmera ou galeria para a imagem de inspiração;
- comandos salvos do Produção;
- instrução complementar;
- `generate_mug_art`;
- catalogação visual opcional e sem trava;
- arte horizontal 2400 × 960;
- três mockups;
- produto salvo inicialmente como inativo;
- histórico mobile das canecas cadastradas, incluindo ativas e inativas;
- busca e filtro por situação;
- botão **Usar modelo** nas canecas existentes;
- botão **Apagar**, com o mesmo princípio seguro do Produção: arquiva primeiro em `produtos_excluidos`, depois remove de `/produtos` e de `canecas/modelos_criacao`.

## Automação

Webhook fixo no aplicativo:

`https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4`

Não existe tela de configuração do webhook no celular.

## Observação sobre exclusão

O botão **Apagar** remove o cadastro da caneca e seus registros de modelo/personalização no Firebase, preservando uma cópia de segurança em `produtos_excluidos`. Os arquivos de imagem que já foram gravados fisicamente no repositório GitHub não são apagados pelo navegador mobile, pois isso exigiria expor uma credencial de escrita do GitHub no site. Essa é deliberadamente mantida fora do código público.

A antiga aba pública de teste foi removida do Caneca10. A personalização de clientes pertence ao site principal da Dona Antônia.
